import QtQuick 2.12
import QtQuick.Controls 2.12
import QtQuick.Layouts 1.12

Rectangle {
    id: root

    signal clicked()

    property string iconText: ""
    property string labelText: ""
    property string pageName: ""
    property bool isActive: false

    property color bg: "#050d14"
    property color bgCard: "#0f1c28"
    property color bgCardHover: "#152536"
    property color bgCardActive: "#0d1a28"
    property color iconColor: "#00e5ff"
    property color iconHover: "#00b8d4"
    property color text: "#FFFFFF"

    Layout.fillWidth: true
    Layout.preferredHeight: 70
    Layout.leftMargin: 10
    Layout.rightMargin: 10
    Layout.topMargin: 4

    radius: 8
    color: isActive ? bgCardActive : (mouseArea.pressed ? bgCardHover : bgCard)
    border.color: isActive ? iconColor : "transparent"
    border.width: isActive ? 1 : 0

    RowLayout {
        anchors.fill: parent
        anchors.leftMargin: 14
        anchors.rightMargin: 10
        spacing: 12

        Text {
            text: root.iconText
            color: root.iconColor
            font.pixelSize: 22
            Layout.preferredWidth: 32
            horizontalAlignment: Text.AlignHCenter
            verticalAlignment: Text.AlignVCenter
        }

        Text {
            text: root.labelText
            color: root.text
            font.pixelSize: 15
            font.bold: root.isActive
            Layout.fillWidth: true
            verticalAlignment: Text.AlignVCenter
        }
    }

    MouseArea {
        id: mouseArea
        anchors.fill: parent
        onClicked: root.clicked()
    }
}
