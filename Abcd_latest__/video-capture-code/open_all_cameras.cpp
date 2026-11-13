#include <opencv2/opencv.hpp>
#include <iostream>


#include <opencv2/opencv.hpp>
#include <iostream>
#include <vector>

int main() {
    const int num_cameras = 3; // 摄像头数量
    const int width = 640;      // 窗口宽度
    const int height = 480;     // 窗口高度
    std::vector<cv::VideoCapture> caps(num_cameras);
    std::vector<cv::Mat> frames(num_cameras);
    int index2=11;

    // 打开摄像头
    for (int i = 0; i < num_cameras; ++i) {
        int indexOpen;
        if(i<4)
            indexOpen = i;
        else{
            indexOpen = index2+i-4;
        }
         std::cout << "打开摄像头 indexOpen= " << indexOpen << std::endl;
        caps[i].open(indexOpen);
        if (!caps[i].isOpened()) {
            std::cerr << "无法打开摄像头 " << i << std::endl;
            return -1;
        }
        caps[i].set(cv::CAP_PROP_FRAME_WIDTH, width);
        caps[i].set(cv::CAP_PROP_FRAME_HEIGHT, height);
    }

    while (true) {
        // 捕获帧
        for (int i = 0; i < num_cameras; ++i) {
            caps[i] >> frames[i];

            if (frames[i].empty()) {
                std::cerr << "无法获取摄像头 " << i << " 的帧。" << std::endl;
                return -1;
            }

            // 显示帧
            cv::imshow("Camera " + std::to_string(i), frames[i]);
        }

        // 按 'q' 键退出
        if (cv::waitKey(30) == 'q') {
            break;
        }
    }

    // 释放摄像头和关闭所有窗口
    for (int i = 0; i < num_cameras; ++i) {
        caps[i].release();
    }
    cv::destroyAllWindows();

    return 0;
}

// int main2() {
//     // 尝试打开并显示多个摄像头
//     int camera_index = 0;
//     cv::Mat frame;
//     int frameCount=0;

//     while (true) {
//         // 尝试打开摄像头
//         cv::VideoCapture cap(camera_index);

//         if (!cap.isOpened()) {
//             std::cerr << "摄像头 " << camera_index << " 无法打开，可能没有更多摄像头。" << std::endl;
//             //break; // 如果无法打开，跳出循环
//             camera_index++;
//             if(camera_index>30)
//                 break;
//             continue;
//         }

//         std::cout << "打开摄像头 " << camera_index << std::endl;
// 	frameCount=0;

//         while (true) {
//             // 捕获帧
//             cap >> frame;

//             if (frame.empty()) {
//                 std::cerr << "无法获取帧。" << std::endl;
//                 break;
//             }

//             // 显示帧
//             cv::imshow("Camera " + std::to_string(camera_index), frame);
// 	    frameCount++;
// 	    if(frameCount>20){
// 	    	break;
// 	    }

//         std::cout << "按q关闭当前，继续打开下一个 " << camera_index << std::endl;
//             // 按 'q' 键退出
//             if (cv::waitKey(30) == 'q') {
//                 break;
//             }
//         }

//         // 释放当前摄像头
//         cap.release();
//         camera_index++; // 尝试下一个摄像头
// 	if(camera_index>21)
// 		break;
//     }
//     cv::waitKey(300);

//     cv::destroyAllWindows();
//     return 0;
// }
