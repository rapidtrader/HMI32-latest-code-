#include "mainwindow.h"
#include <QApplication>
#include <QPalette>
#include <QShortcut>
#include <cstdlib>

int main(int argc, char *argv[])
{
    QApplication a(argc, argv);
    MainWindow w;
    w.setStyleSheet("QMainWindow, QWidget { background-color: black; }");

    const bool from_hmi = std::getenv("HMI_CAMERA_CHILD") != nullptr;

    // 设置窗口全屏
    w.showFullScreen();
    w.showMaximized();
    w.show();

    if (from_hmi) {
        auto *esc = new QShortcut(QKeySequence(Qt::Key_Escape), &w);
        QObject::connect(esc, &QShortcut::activated, &a, &QApplication::quit);
    }

    return a.exec();
}




