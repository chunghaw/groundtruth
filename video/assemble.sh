#!/usr/bin/env bash
# Assemble a deck: per beat, align the captured clip to its voiceover, overlay the caption PNG,
# add title/end cards, concat, loudness-normalise, H.264. Asserts duration and size.
#
#   bash assemble.sh <deck> [output.mp4]
#   pitch -> <repo>/pitch.mp4, demo -> <repo>/demo.mp4, others -> video/out/<deck>/<deck>.mp4
set -euo pipefail

DECK="${1:?usage: assemble.sh <deck> [output.mp4]}"
VIDEO_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_DIR="$(dirname "$VIDEO_DIR")"
case "$DECK" in
  pitch|demo) DEFAULT_OUT="$REPO_DIR/$DECK.mp4" ;;
  *) DEFAULT_OUT="$VIDEO_DIR/out/$DECK/$DECK.mp4" ;;
esac
OUT="${2:-$DEFAULT_OUT}"
MAX_BYTES=$((95 * 1000 * 1000))

if ! command -v ffmpeg >/dev/null 2>&1 || ! command -v ffprobe >/dev/null 2>&1; then
  echo "ffmpeg/ffprobe not found. Install with:  brew install ffmpeg" >&2
  exit 2
fi

if ffmpeg -hide_banner -encoders 2>/dev/null | grep -q libx264; then
  VENC=(-c:v libx264 -preset medium -crf 23 -profile:v high)
else
  echo "! libx264 missing, using h264_videotoolbox" >&2
  VENC=(-c:v h264_videotoolbox -b:v 8M)
fi

WORK="$VIDEO_DIR/out/$DECK/segments"
rm -rf "$WORK" && mkdir -p "$WORK"
PLAN="$WORK/plan.tsv"
node "$VIDEO_DIR/lib/plan.ts" "$DECK" > "$PLAN"
MAX_SEC="$(awk -F'\t' '$1=="#MAX"{print $2}' "$PLAN")"

LIST="$WORK/list.txt"
: > "$LIST"
i=0
while IFS=$'\t' read -r id kind src dur audio cap crop ss; do
  [[ "$id" == "#MAX" ]] && continue
  i=$((i + 1))
  seg="$WORK/$(printf '%02d' "$i")-$id.mp4"
  inputs=()
  if [[ "$kind" == "clip" && "$src" == *.mp4 ]]; then inputs+=(-ss "${ss:-0}" -i "$src");
  elif [[ "$kind" == "clip" ]]; then inputs+=(-f concat -safe 0 -i "$src"); else inputs+=(-loop 1 -framerate 30 -i "$src"); fi
  if [[ "$audio" != "-" ]]; then inputs+=(-i "$audio"); else inputs+=(-f lavfi -i "anullsrc=r=48000:cl=stereo"); fi

  vf=""
  [[ "$crop" != "-" ]] && vf="crop=${crop},"
  vf+="scale=1920:1080:force_original_aspect_ratio=decrease:flags=lanczos,pad=1920:1080:(ow-iw)/2:(oh-ih)/2:color=0x14181d,setsar=1,fps=30"
  vf+=",tpad=stop_mode=clone:stop_duration=600,trim=duration=${dur},setpts=PTS-STARTPTS"
  if [[ "$id" == "title" ]]; then vf+=",fade=t=in:st=0:d=0.4"; fi
  if [[ "$id" == "end" ]]; then vf+=",fade=t=out:st=$(awk "BEGIN{print $dur-0.5}"):d=0.5"; fi

  if [[ "$cap" != "-" ]]; then
    inputs+=(-loop 1 -framerate 30 -i "$cap")
    fc="[0:v]${vf}[base];[2:v]format=rgba,fade=t=in:st=0:d=0.25:alpha=1[cap];[base][cap]overlay=0:0:shortest=1:format=auto[v]"
  else
    fc="[0:v]${vf}[v]"
  fi
  fc+=";[1:a]aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo,apad,atrim=duration=${dur}[a]"

  echo "segment $i $id ($kind, ${dur}s)"
  ffmpeg -nostdin -hide_banner -loglevel error -y "${inputs[@]}" -filter_complex "$fc" \
    -map "[v]" -map "[a]" -t "$dur" "${VENC[@]}" -pix_fmt yuv420p -r 30 \
    -c:a aac -b:a 160k -ar 48000 -ac 2 "$seg"
  echo "file '$seg'" >> "$LIST"
done < "$PLAN"

mkdir -p "$(dirname "$OUT")"
echo "concat + loudnorm -> $OUT"
ffmpeg -nostdin -hide_banner -loglevel error -y -f concat -safe 0 -i "$LIST" \
  -c:v copy -af "loudnorm=I=-16:TP=-1.5:LRA=11" -c:a aac -b:a 160k -ar 48000 -ac 2 \
  -movflags +faststart "$OUT"

DUR="$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$OUT")"
BYTES="$(stat -f%z "$OUT" 2>/dev/null || stat -c%s "$OUT")"
echo "$OUT: ${DUR}s, $((BYTES / 1000000)) MB"
awk "BEGIN{exit !($DUR <= $MAX_SEC + 0.05)}" || { echo "FAIL: duration ${DUR}s > ${MAX_SEC}s" >&2; exit 4; }
(( BYTES < MAX_BYTES )) || { echo "FAIL: size ${BYTES} bytes >= 95 MB" >&2; exit 5; }
echo "OK: <= ${MAX_SEC}s and < 95 MB"
