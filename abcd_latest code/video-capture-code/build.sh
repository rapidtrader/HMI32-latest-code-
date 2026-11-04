#!/bin/sh
g++ open_camera.cpp -o open_camera `pkg-config --cflags --libs opencv4`
g++ open_all_cameras.cpp -o open_all_cameras `pkg-config --cflags --libs opencv4`

