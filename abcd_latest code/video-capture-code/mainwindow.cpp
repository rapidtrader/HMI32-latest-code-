#include "mainwindow.h"
#include "ui_mainwindow.h"

#include <unistd.h>
#include <cstdlib>

#include <QDebug>
#include <gst/video/videooverlay.h>
//#include "gst/gsignal.h"


#include <gst/gst.h>
#include <gst/gstpad.h>
#include <gst/gstmessage.h>
#include <gst/app/gstappsrc.h>

MainWindow::MainWindow(QWidget *parent) :
    QMainWindow(parent),
    ui(new Ui::MainWindow)
{
    ui->setupUi(this);

    //m_winId = ui->widget->winId();

    //setupGStreamer(m_winId);

//    this->showFullScreen();
//    this->showMaximized();
    m_winId[0] = ui->widget->winId();
    m_winId[1] = ui->widget_2->winId();
    m_winId[2] = ui->widget_3->winId();
    m_winId[3] = ui->widget_4->winId();

    m_winId[4] = ui->widget_5->winId();
    m_winId[5] = ui->widget_6->winId();
    m_winId[6] = ui->widget_7->winId();
    m_winId[7] = ui->widget_8->winId();

    for(int i=0; i<MAX_CAMERA_COUNT; i++){
        m_testWorker[i] = new gstWorker();
        m_testWorker[i]->setWinId(m_winId);
        m_testWorker[i]->SetCurIndex(i);
        // 将 worker 对象移动到 workerThread 线程中
        m_testWorker[i]->moveToThread(&workerThread[i]);

        QObject::connect(&workerThread[i], &QThread::started, m_testWorker[i], &gstWorker::doWork);
    }
}

void MainWindow::showEvent(QShowEvent *event)
{
    QMainWindow::showEvent(event);

    // winId must be read after widgets are shown (xvimagesink overlay).
    m_winId[0] = ui->widget->winId();
    m_winId[1] = ui->widget_2->winId();
    m_winId[2] = ui->widget_3->winId();
    m_winId[3] = ui->widget_4->winId();
    m_winId[4] = ui->widget_5->winId();
    m_winId[5] = ui->widget_6->winId();
    m_winId[6] = ui->widget_7->winId();
    m_winId[7] = ui->widget_8->winId();
    for (int i = 0; i < MAX_CAMERA_COUNT; i++) {
        m_testWorker[i]->setWinId(m_winId);
    }

    static bool s_started = false;
    if (s_started) {
        return;
    }
    s_started = true;
    for (int i = 0; i < MAX_CAMERA_COUNT; i++) {
        workerThread[i].start();
    }
}

MainWindow::~MainWindow()
{
    for(int i=0; i<MAX_CAMERA_COUNT; i++){
        workerThread[i].terminate();
        workerThread[i].exit();
    }
    delete ui;
}

int gstWorker::yolov5_main()
{
#if 0
    int ret;
    char* model_name = "";//(char*)argv[1];
    char* video_name = NULL;//argv[2];
    int video_type = 0;//atoi(argv[3]);

    rknn_app_context_t app_ctx;
    memset(&app_ctx, 0, sizeof(rknn_app_context_t));

    ret = init_model(model_name, &app_ctx);
    if (ret != 0) {
      printf("init model fail\n");
      return -1;
    }


    if (app_ctx.out_fp == NULL) {
      FILE* fp = fopen(OUT_VIDEO_PATH, "w");
      if(fp == NULL) {
          printf("open %s error\n", OUT_VIDEO_PATH);
          return -1;
      }
      app_ctx.out_fp = fp;
    }


    // release
    fflush(app_ctx.out_fp);
    fclose(app_ctx.out_fp);


    release_model(&app_ctx);
#endif
    return 0;
}

//G_CALLBACK(enough_data_callback)
void padAdded_callback(GstElement *src, GstPad *pad, gpointer data)
{
    Q_UNUSED(src);
    GstElement *depay = (GstElement *)data;
    GstPad *sinkpad = gst_element_get_static_pad(depay, "sink");
    gst_pad_link(pad, sinkpad);
    gst_object_unref(sinkpad);
}

#include <gst/gst.h>
#include <gst/app/gstappsink.h>

/* Structure to contain all our information, so we can pass it to callbacks */
typedef struct _CustomData {
    GstElement *pipeline;
    GstElement *source;
    GstElement *depay;
    GstElement *parse;
    GstElement *avdec;
    GstElement *convert;
    GstElement *resample;
    GstElement *sink;
} CustomData;

/* Handler for the pad-added signal */
static void pad_added_handler (GstElement *src, GstPad *pad, CustomData *data);

int gstWorker::setupGStreamerRtsp(char *uri, int camera_id)
{
    CustomData data;
    GstBus *bus;
    GstMessage *msg;
    GstStateChangeReturn ret;
    gboolean terminate = FALSE;
    /* Initialize GStreamer */
    gst_init (NULL, NULL);
    /* Create the elements */
    data.source = gst_element_factory_make ("rtspsrc", "source");
    g_object_set (G_OBJECT (data.source), "latency", 100, NULL);
#if 0
    data.depay = gst_element_factory_make ("rtph265depay", "depay");
    data.parse = gst_element_factory_make ("h265parse", "parse");
#else
    data.depay = gst_element_factory_make ("rtph264depay", "depay");
    data.parse = gst_element_factory_make ("h264parse", "parse");
#endif
    data.avdec = gst_element_factory_make ("mppvideodec", "avdec");//decoder
    data.convert = gst_element_factory_make ("videoconvert", "convert");
    // data.resample = gst_element_factory_make ("audioresample", "resample");
    data.sink = gst_element_factory_make ("glimagesink", "sink");
    // g_object_set (G_OBJECT (data.sink), "sync", FALSE, NULL);
    /* Set the URI to play */
    g_object_set (data.source, "location", uri, NULL);
    /* Connect to the pad-added signal */
    g_signal_connect (data.source, "pad-added", G_CALLBACK (pad_added_handler), &data);
    /* Create the empty pipeline */
    data.pipeline = gst_pipeline_new ("test-pipeline");
    if (!data.pipeline || !data.source || !data.convert || !data.sink) {
        g_printerr ("Not all elements could be created.\n");
        return -1;
    }
    /* Build the pipeline. Note that we are NOT linking the source at this
    * point. We will do it later. */
    gst_bin_add_many (GST_BIN (data.pipeline), data.source, data.depay, data.parse, data.avdec, data.convert, data.sink, NULL);
    if (!gst_element_link_many (data.depay, data.parse, data.avdec, data.convert, data.sink, NULL)) {
        g_printerr ("Elements could not be linked.\n");
        gst_object_unref (data.pipeline);
        return -1;
    }

    // 设置 GL sink 的窗口句柄
    gst_video_overlay_set_window_handle(GST_VIDEO_OVERLAY(data.sink), (guintptr)m_winId[camera_id]);


    /* Start playing */
    ret = gst_element_set_state (data.pipeline, GST_STATE_PLAYING);
    if (ret == GST_STATE_CHANGE_FAILURE) {
        g_printerr ("Unable to set the pipeline to the playing state.\n");
        gst_object_unref (data.pipeline);
        return -1;
    }
    /* Listen to the bus */
    bus = gst_element_get_bus (data.pipeline);
    do {
        msg = gst_bus_timed_pop_filtered (bus, GST_CLOCK_TIME_NONE,
        (GstMessageType)(GST_MESSAGE_STATE_CHANGED | GST_MESSAGE_ERROR | GST_MESSAGE_EOS));
        /* Parse message */
        if (msg != NULL) {
        GError *err;
        gchar *debug_info;
        switch (GST_MESSAGE_TYPE (msg)) {
            case GST_MESSAGE_ERROR:
            gst_message_parse_error (msg, &err, &debug_info);
            g_printerr ("Error received from element %s: %s\n", GST_OBJECT_NAME (msg->src), err->message);
            g_printerr ("Debugging information: %s\n", debug_info ? debug_info : "none");
            g_clear_error (&err);
            g_free (debug_info);
            terminate = TRUE;
            break;
            case GST_MESSAGE_EOS:
            g_print ("End-Of-Stream reached.\n");
            terminate = TRUE;
            break;
            case GST_MESSAGE_STATE_CHANGED:
            /* We are only interested in state-changed messages from the pipeline */
            if (GST_MESSAGE_SRC (msg) == GST_OBJECT (data.pipeline)) {
                GstState old_state, new_state, pending_state;
                gst_message_parse_state_changed (msg, &old_state, &new_state, &pending_state);
                g_print ("Pipeline state changed from %s to %s:\n",
                gst_element_state_get_name (old_state), gst_element_state_get_name (new_state));
            }
            break;
            default:
            /* We should not reach here */
            g_printerr ("Unexpected message received.\n");
            break;
        }
        gst_message_unref (msg);
        }
    } while (!terminate);

    /* Free resources */
    gst_object_unref (bus);
    gst_element_set_state (data.pipeline, GST_STATE_NULL);
    gst_object_unref (data.pipeline);
    return 0;

}


int gstWorker::setupGStreamerDev(int camera_id)
{
    gst_init (NULL, NULL);

    // 创建 GStreamer 元素
    GstElement *pipeline = gst_pipeline_new("video-pipeline"+camera_id);
    GstElement *source = gst_element_factory_make("v4l2src", "video-source");
    GstElement *capsfilter = gst_element_factory_make("capsfilter", "caps-filter");
    GstElement *videoconvert = gst_element_factory_make("videoconvert", "video-convert");
    GstElement *sink = gst_element_factory_make("xvimagesink", "video-sink");

    if (!pipeline || !source || !capsfilter || !videoconvert || !sink) {
        g_printerr("Not all elements could be created.\n");
        return -1;
    }

    // 设置源设备
    //g_object_set(source, "device", "/dev/video0", NULL);
    //std::string device = "/dev/video" + std::to_string(camera_id);
     //g_object_set(source, "device", device.c_str(), nullptr);
     int devIndex = 0;
     devIndex = camera_id;
     if(devIndex>=4){
        devIndex = camera_id-4+11; //add by ldp test
     }

     QString device;
     {
         QByteArray envKey = QByteArray("CAMERA_DEVICE_") + QByteArray::number(camera_id);
         const char *envDev = std::getenv(envKey.constData());
         if (envDev != nullptr && envDev[0] != '\0') {
             device = QString::fromLocal8Bit(envDev);
         } else {
             device = QString("/dev/video%1").arg(devIndex);
         }
     }
     g_object_set(source, "device", device.toLocal8Bit().data(), nullptr);

     const char *fmtEnv = std::getenv("CAMERA_PIXEL_FORMAT");
     const char *pixFmt = (fmtEnv != nullptr && fmtEnv[0] != '\0') ? fmtEnv : "NV12";
     int fps = VIDEO_FPS;
     if (const char *fpsEnv = std::getenv("CAMERA_FPS")) {
         int v = atoi(fpsEnv);
         if (v > 0 && v <= 60) {
             fps = v;
         }
     }

     // Supplier AHD: NV12 1920x1080 @ 20fps on /dev/video1 (not NV16 on video0).
    GstCaps *caps = gst_caps_new_simple("video/x-raw",
                                         "format", G_TYPE_STRING, pixFmt,
                                         "width", G_TYPE_INT, VIDEO_WIDTH,
                                         "height", G_TYPE_INT, VIDEO_HIGHT,
                                         "framerate", GST_TYPE_FRACTION, fps, 1,
                                         NULL);
    g_object_set(capsfilter, "caps", caps, NULL);
    gst_caps_unref(caps);

    // 将元素添加到管道中
    gst_bin_add_many(GST_BIN(pipeline), source, capsfilter, videoconvert, sink, NULL);

    // 链接元素
    if (!gst_element_link_many(source, capsfilter, videoconvert, sink, NULL)) {
        g_printerr("Elements could not be linked.\n");
        gst_object_unref(pipeline);
        return -1;
    }
    int winId=0;
    if(camera_id<4){
        winId = camera_id;
    }else{
        winId = camera_id; //-11+4;//add by ldp test
    }
    qDebug()<<"device="<<device <<" camera_id="<<camera_id<<" winId="<<winId;
    // 设置 GL sink 的窗口句柄
    gst_video_overlay_set_window_handle(GST_VIDEO_OVERLAY(sink), (guintptr)m_winId[winId]);


    // 启动管道
    gst_element_set_state(pipeline, GST_STATE_PLAYING);

    // 主循环
    GstBus *bus = gst_element_get_bus(pipeline);
    GstMessage *msg;
    bool terminate = false;

    while (!terminate) {
        msg = gst_bus_timed_pop_filtered(bus, GST_CLOCK_TIME_NONE, (GstMessageType)(GST_MESSAGE_ERROR | GST_MESSAGE_EOS));

        // 处理消息
        if (msg != NULL) {
            GError *err;
            switch (GST_MESSAGE_TYPE(msg)) {
                case GST_MESSAGE_ERROR:
                    gst_message_parse_error(msg, &err, NULL);
                    g_printerr("Error received from element %s: %s\n", GST_OBJECT_NAME(msg->src), err->message);
                    //g_printerr("Debugging information: %s\n", err->debug ? err->debug : "none");
                    g_error_free(err);
                    terminate = true;
                    break;
                case GST_MESSAGE_EOS:
                    g_print("End-Of-Stream reached.\n");
                    terminate = true;
                    break;
                default:
                    break;
            }
            gst_message_unref(msg);
        }
    }

    // 清理
    gst_object_unref(bus);
    gst_element_set_state(pipeline, GST_STATE_NULL);
    gst_object_unref(pipeline);
    return 0;
}


/* This function will be called by the pad-added signal */
static void pad_added_handler (GstElement *src, GstPad *new_pad, CustomData *data) {
    GstPad *sink_pad = gst_element_get_static_pad (data->depay, "sink");
    GstPadLinkReturn ret;
    GstCaps *new_pad_caps = NULL;
    GstStructure *new_pad_struct = NULL;
    const gchar *new_pad_type = NULL;
    g_print ("Received new pad '%s' from '%s':\n", GST_PAD_NAME (new_pad), GST_ELEMENT_NAME (src));
    /* If our converter is already linked, we have nothing to do here */
    if (gst_pad_is_linked (sink_pad)) {
        g_print ("We are already linked. Ignoring.\n");
        goto exit;
    }
    /* Check the new pad's type */
    new_pad_caps = gst_pad_get_current_caps (new_pad);
    new_pad_struct = gst_caps_get_structure (new_pad_caps, 0);
    new_pad_type = gst_structure_get_name (new_pad_struct);
    /* Attempt the link */
    ret = gst_pad_link (new_pad, sink_pad);
    if (GST_PAD_LINK_FAILED (ret)) {
         g_print ("Type is '%s' but link failed.\n", new_pad_type);
    } else {
        g_print ("Link succeeded (type '%s').\n", new_pad_type);
    }
    exit:
    /* Unreference the new pad's caps, if we got them */
    if (new_pad_caps != NULL)
    gst_caps_unref (new_pad_caps);
    /* Unreference the sink pad */
    gst_object_unref (sink_pad);
}


//gst-launch-1.0 rtspsrc location="rtsp://admin:@192.168.6.211:554/user=admin&password=&channel=1&stream=0.sdp?" latency=0 ! rtph265depay ! decodebin ! videoconvert ! autovideosink

//mppvideodec 在命令行不能用
//gst-launch-1.0 rtspsrc location="rtsp://admin:@192.168.6.211:554/user=admin&password=&channel=1&stream=0.sdp?" latency=0 ! rtph265depay ! mppvideodec ! videoconvert ! autovideosink

// void gstWorker::setupGStreamer11()
// {

//     //main_test2();
//     //return;

//    GstBus *bus;
//    GstMessage *msg;


//    gst_init(nullptr, nullptr);

//    pipeline = gst_pipeline_new("video-pipeline");

//    // 创建 GStreamer 元素
//    GstElement *source = gst_element_factory_make("rtspsrc", "source");
//    GstElement *depay = gst_element_factory_make("rtph265depay", "depay");
//    GstElement *decode = gst_element_factory_make("mppvideodec", "decode");//mppvideodec
//    GstElement *convert = gst_element_factory_make("videoconvert", "convert");
//    GstElement *sink = gst_element_factory_make("glimagesink", "sink");

//    // 检查元素是否创建成功
//    if (!pipeline || !source || !depay || !decode || !convert || !sink) {
//        qWarning("Failed to create GStreamer elements");
//        return;
//    }

//    // 设置 RTSP 源
//    g_object_set(source, "location", "rtsp://admin:@192.168.6.211:554/user=admin&password=&channel=1&stream=0.sdp?", nullptr);

//    g_object_set(source, "latency", 0, NULL);

//    // 处理动态 pad
//    g_signal_connect(source, "pad-added", G_CALLBACK(padAdded_callback), depay);

//    // 将元素添加到管道中
//    gst_bin_add_many(GST_BIN(pipeline), source, depay, decode, convert, sink, nullptr);

//    //gst_element_link_many(source
//    gboolean bret = gst_element_link(depay, decode);
//    if(!bret){
//        g_printerr("Elements could not be linked 1.\n");
//       gst_object_unref(pipeline);
//       return ;
//    }
//    bret = gst_element_link(decode, convert);
//    if(!bret){
//        g_printerr("Elements could not be linked 2.\n");
//       gst_object_unref(pipeline);
//       return ;
//    }
//    bret = gst_element_link(convert, sink);
//    if(!bret){
//        g_printerr("Elements could not be linked 3.\n");
//       gst_object_unref(pipeline);
//       return ;
//    }

/*
////    GstElement *vsink = gst_element_factory_make ("ximagesink", "vsink");
////     WId xwinid = window->getVideoWId();
////     ui->widget->winId();
////     gst_video_overlay_set_window_handle (GST_VIDEO_OVERLAY (vsink), xwinid);
////     g_object_set(GST_OBJECT(pipeline), "video-sink", vsink, NULL);
*/

//    // 设置 GL sink 的窗口句柄
//    gst_video_overlay_set_window_handle(GST_VIDEO_OVERLAY(sink), (guintptr)m_winId);

//    gst_element_set_state(pipeline, GST_STATE_PLAYING);

////    while(1){
////        sleep(1);
////    }
//    qDebug()<<"gst_element_set_state";


////    while (1) { // 无限循环以持续播放

////      usleep(1000000 ); // 控制为指定帧率
////    }

////    // 发送 EOS（结束流）
////    g_signal_emit_by_name(source, "end-of-stream", NULL);

//    // 等待播放完成
//    bus = gst_element_get_bus(pipeline);
//    msg = gst_bus_timed_pop_filtered(bus, GST_CLOCK_TIME_NONE,
//                                      (GstMessageType)(GST_MESSAGE_ERROR | GST_MESSAGE_EOS));

//    // 处理消息
//    if (msg != NULL) {
//        GError *err;
//        gchar *debug_info;

//        switch (GST_MESSAGE_TYPE(msg)) {
//            case GST_MESSAGE_ERROR:
//                gst_message_parse_error(msg, &err, &debug_info);
//                g_printerr("Error received from element %s: %s\n",
//                            GST_OBJECT_NAME(msg->src), err->message);
//                g_printerr("Debugging information: %s\n", debug_info ? debug_info : "none");
//                g_clear_error(&err);
//                g_free(debug_info);
//                break;
//            case GST_MESSAGE_EOS:
//                g_print("End-Of-Stream reached.\n");
//                break;
//            default:
//                g_printerr("Unexpected message received.\n");
//                break;
//        }
//        gst_message_unref(msg);
//    }

//    // 清理
//    gst_object_unref(bus);
//    gst_element_set_state(pipeline, GST_STATE_NULL);
//    gst_object_unref(pipeline);

// }
