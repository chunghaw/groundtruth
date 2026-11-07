#!/bin/bash
# Usage: rec.sh start <name> | rec.sh stop
# Records the main screen with ffmpeg (avfoundation) into video/out/real/<name>.mp4
D="$(cd "$(dirname "$0")" && pwd)/out/real"
case "$1" in
  start)
    ffmpeg -hide_banner -loglevel error -y -f avfoundation -pixel_format uyvy422 -framerate 30 -capture_cursor 1 -i "Capture screen ${GT_SCREEN:-1}:none" \
      -vf "scale=1920:-2" -c:v libx264 -preset veryfast -crf 20 -pix_fmt yuv420p "$D/$2.mp4" </dev/null >"$D/$2.log" 2>&1 &
    echo $! > "$D/.pid"; echo "recording $2 (pid $(cat "$D/.pid"))";;
  stop)
    kill -INT "$(cat "$D/.pid")" 2>/dev/null; sleep 2; ls -la "$D"/*.mp4;;
esac
