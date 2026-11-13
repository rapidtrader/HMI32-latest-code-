#ifndef MAINWINDOW_H
#define MAINWINDOW_H


#include <QMainWindow>


#include <QApplication>
#include <QMainWindow>
#include <QWidget>
#include <QVBoxLayout>
#include <QTimer>

#include <QDebug>
#include <QThread>

#include "gst/gstelement.h"

//#include "gst/gst.h"


namespace Ui {
class MainWindow;
}

#if 0
    // 查看摄像头编号情况 v4l2-ctl --list-devices
    // /dev/video0
    //播放0-4 和11-14，COUNT=8
    //播放0-4，COUNT=4
    #define MAX_CAMERA_COUNT 4  //8
    #define START_CAMERA_ID  0 

#else
    //如果8路，只播放后4路
    #define MAX_CAMERA_COUNT 8
    #define START_CAMERA_ID  0
#endif

#define VIDEO_WIDTH 1920
#define VIDEO_HIGHT 1080
#define VIDEO_FPS   25 //20  //30

class gstWorker : public QObject {
    Q_OBJECT

public:
    GstElement *pipeline;

    int yolov5_main();
    WId m_winId[MAX_CAMERA_COUNT];
    void setWinId(WId *id){
        for(int i=0; i<MAX_CAMERA_COUNT; i++){
            m_winId[i] = id[i];
        }
    }
    int m_curIndex;

    void SetCurIndex(int index){
        m_curIndex = index;
    }

    int setupGStreamerRtsp(char *uri, int camera_id);
    int setupGStreamerDev(int camera_id);


    //void setupGStreamer11();

public:
    gstWorker() {
        qDebug()<<"gstWorker-----";

    }

    void doWork() {
        qDebug() << "Worker thread:" << QThread::currentThread() <<" m_curIndex="<<m_curIndex;
#if 0
        char *uri=NULL;
        if(m_curIndex==0){
            uri = "rtsp://admin:qwer1234@192.168.6.119:554//Streaming/Channels/1";
            setupGStreamerRtsp(uri, m_curIndex);
        }
        else{
            uri = "rtsp://admin:qwer1234@192.168.6.129:554//Streaming/Channels/1";
            setupGStreamerRtsp(uri, m_curIndex);
        }
#else
        if(m_curIndex >= START_CAMERA_ID){
            setupGStreamerDev(m_curIndex);
        }
#endif
    }
};

class MainWindow : public QMainWindow
{
    Q_OBJECT

public:
    explicit MainWindow(QWidget *parent = 0);
    ~MainWindow();

    WId m_winId[8]; //MAX_CAMERA_COUNT
protected:
    void showEvent(QShowEvent *event) override;


private:
    Ui::MainWindow *ui;

    QThread workerThread[MAX_CAMERA_COUNT];
    gstWorker* m_testWorker[MAX_CAMERA_COUNT];
private:
    //QWidget *videoWidget;

};

#endif // MAINWINDOW_H
