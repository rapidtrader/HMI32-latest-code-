查看摄像头信息

```shell



v4l2-ctl --list-devices

#CSI1对应的4个相机节点分别是 /dev/video0 /dev/video1 /dev/video2 /dev/video3

#查看相机支持的分辨率
v4l2-ctl --list-formats-ext --device /dev/video0


#v4l2-ctl 取流, ffplay播放
v4l2-ctl --verbose -d /dev/video0 --set-fmt-video=width=1920,height=1080,pixelformat=NV12 --stream-mmap=3 --stream-to=mstahd.yuv --stream-count=100 --stream-poll

#ffplay播放
ffplay -f rawvideo -video_size 1920x1080 -pix_fmt nv12 mstahd.yuv
```

**gst-launch** **命令使用**

```shell
export DISPLAY=:0
export XAUTHORITY=/home/marvsmart/.Xauthority
export LD_LIBRARY_PATH=$LD_LIBRARY_PATH:/usr/lib/aarch64-linux-gnu/gstreamer-1.0
SINK=ximagesink
gst-launch-1.0 v4l2src device=/dev/video0 ! video/x-raw,format=NV12,width=1920,height=1080, framerate=20/1 ! videoconvert ! $SINK &
wait
```

**取流后编码为****H264****保存**

```shell
gst-launch-1.0 v4l2src device=/dev/video0 num-buffers=500 ! videoconvert ! video/x-raw,format=NV12,width=1920,height=1080 ! queue ! mpph264enc ! queue ! h264parse ! qtmux ! filesink location=h264.mp4
```

**取流后编码推流**

```shell
gst-launch-1.0 v4l2src device=/dev/video0 ! videoconvert ! video/x-raw,format=NV12,width=1920,height=1080 ! queue ! mpph264enc ! queue ! h264parse ! flvmux streamable=true ! queue ! rtmpsink sync=false location="rtmp://192.168.6.125"
```

