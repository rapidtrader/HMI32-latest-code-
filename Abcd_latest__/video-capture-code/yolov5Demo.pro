#-------------------------------------------------
#
# Project created by QtCreator 2024-11-01T14:27:50
#
#-------------------------------------------------

QT       += core gui

greaterThan(QT_MAJOR_VERSION, 4): QT += widgets

TARGET = yolov5Demo
TEMPLATE = app

# The following define makes your compiler emit warnings if you use
# any feature of Qt which has been marked as deprecated (the exact warnings
# depend on your compiler). Please consult the documentation of the
# deprecated API in order to know how to port your code away from it.
DEFINES += QT_DEPRECATED_WARNINGS



unix{
    INCLUDEPATH += /usr/include/glib-2.0
    INCLUDEPATH += /usr/include/gstreamer-1.0
    INCLUDEPATH += /usr/lib/aarch64-linux-gnu/glib-2.0/include
    LIBS += -L/usr/lib/aarch64-linux-gnu -lgstreamer-1.0
    LIBS += -L/usr/lib/aarch64-linux-gnu -lgobject-2.0
    LIBS += -L/usr/lib/aarch64-linux-gnu -lglib-2.0
    LIBS += -L/usr/lib/aarch64-linux-gnu -lgstvideo-1.0
}

# 添加头文件路径
#INCLUDEPATH += $$PWD/include
#INCLUDEPATH += $$PWD/include/gstreamer-1.0
#INCLUDEPATH += $$PWD/include/glib-2.0
#INCLUDEPATH += $$PWD/include/gstreamer-1.0/include
#INCLUDEPATH += $$PWD/include/glib-2.0/include



# 添加库路径
#LIBS += -L$$PWD/lib
#LIBS += -L$$PWD/lib/gst
#LIBS += -L$$PWD/lib/gstreamer-1.0

# 添加库名称
#LIBS += -lgstreamer-1.0  -lglib-2.0   -lgobject-2.0 -lgmodule-2.0 -lunwind  # 不需要加前缀 'lib' 和后缀 '.a' 或 '.so'
#LIBS += -ldw -lpcre -lffi -llzma -lelf -lz -lbz2 -lgstbase-1.0 -lorc-0.4

#LIBS    +=-lgstvideo-1.0             # <gst/video/videooverlay.h>
#LIBS    +=-lgstautodetect


# You can also make your code fail to compile if you use deprecated APIs.
# In order to do so, uncomment the following line.
# You can also select to disable deprecated APIs only up to a certain version of Qt.
#DEFINES += QT_DISABLE_DEPRECATED_BEFORE=0x060000    # disables all the APIs deprecated before Qt 6.0.0


SOURCES += \
        main.cpp \
        mainwindow.cpp \
    utils/drawing.cpp

HEADERS += \
        mainwindow.h \
    utils/drawing.h \
    utils/mpp_decoder.h \
    utils/mpp_encoder.h

FORMS += \
        mainwindow.ui
