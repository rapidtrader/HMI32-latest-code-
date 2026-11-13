#include "mainwindow.h"
#include <QApplication>

int main(int argc, char *argv[])
{
    QApplication a(argc, argv);
    MainWindow w;

    // 设置窗口全屏
    w.showFullScreen();
    w.showMaximized();
    w.show();

    return a.exec();
}




