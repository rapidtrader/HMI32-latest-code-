#include <opencv2/opencv.hpp>
#include <iostream>

int main() {
    // 打开摄像头，0 通常是默认摄像头
    cv::VideoCapture cap(3);

    if (!cap.isOpened()) {
        std::cerr << "无法打开摄像头" << std::endl;
        return -1;
    }

    cv::Mat frame;

    while (true) {
        // 捕获帧
        cap >> frame;

        if (frame.empty()) {
            std::cerr << "无法获取帧" << std::endl;
            break;
        }

        // 显示帧
        cv::imshow("Camera", frame);

        // 按 'q' 键退出
        if (cv::waitKey(30) == 'q') {
            break;
        }
    }

    // 释放摄像头和关闭所有窗口
    cap.release();
    cv::destroyAllWindows();

    return 0;
}
