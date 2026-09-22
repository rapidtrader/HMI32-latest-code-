import QtQuick 2.12
import QtQuick.Controls 2.12
import QtQuick.Layouts 1.12

Rectangle {
    id: sidebar

    signal pageRequested(string pageName)

    property color bg: "#050d14"
    property color bgCard: "#0f1c28"
    property color bgCardHover: "#152536"
    property color bgCardActive: "#0d1a28"
    property color iconColor: "#00e5ff"
    property color iconHover: "#00b8d4"
    property color text: "#FFFFFF"
    property color textDim: "#78909c"
    property color border: "#1a3a52"
    property color borderHover: "#00b8d4"
    property color btnBg: "#263d52"
    property color btnBgHover: "#345066"

    color: sidebar.bg
    property string activeItem: appController.currentPage

    ColumnLayout {
        anchors.fill: parent
        spacing: 0

        Item {
            Layout.fillWidth: true
            Layout.preferredHeight: 100
            Text {
                anchors.centerIn: parent
                text: "DYNACLEAN"
                color: sidebar.iconColor
                font.pixelSize: 24
                font.bold: true
            }
        }


        SidebarItem {
            iconText: "🔄"
            labelText: "Operations"
            pageName: "FollowUpPage"
            isActive: sidebar.activeItem === "FollowUpPage"
            bg: sidebar.bg; bgCard: sidebar.bgCard; bgCardHover: sidebar.bgCardHover
            bgCardActive: sidebar.bgCardActive; iconColor: sidebar.iconColor
            iconHover: sidebar.iconHover; text: sidebar.text
            onClicked: sidebar.pageRequested("FollowUpPage")
        }

        SidebarItem {
            iconText: "⚙"
            labelText: "Functions"
            pageName: "SweeperControlsPage"
            isActive: sidebar.activeItem === "SweeperControlsPage"
            bg: sidebar.bg; bgCard: sidebar.bgCard; bgCardHover: sidebar.bgCardHover
            bgCardActive: sidebar.bgCardActive; iconColor: sidebar.iconColor
            iconHover: sidebar.iconHover; text: sidebar.text
            onClicked: sidebar.pageRequested("SweeperControlsPage")
        }

        SidebarItem {
            iconText: "📦"
            labelText: "Dumping"
            pageName: "DumpingPage"
            isActive: sidebar.activeItem === "DumpingPage"
            bg: sidebar.bg; bgCard: sidebar.bgCard; bgCardHover: sidebar.bgCardHover
            bgCardActive: sidebar.bgCardActive; iconColor: sidebar.iconColor
            iconHover: sidebar.iconHover; text: sidebar.text
            onClicked: sidebar.pageRequested("DumpingPage")
        }

        SidebarItem {
            iconText: "📊"
            labelText: "Reports"
            pageName: "ReportsPage"
            isActive: sidebar.activeItem === "ReportsPage"
            bg: sidebar.bg; bgCard: sidebar.bgCard; bgCardHover: sidebar.bgCardHover
            bgCardActive: sidebar.bgCardActive; iconColor: sidebar.iconColor
            iconHover: sidebar.iconHover; text: sidebar.text
            onClicked: sidebar.pageRequested("ReportsPage")
        }

        SidebarItem {
            iconText: "📋"
            labelText: "Machine Info"
            pageName: "MachineInfoPage"
            isActive: sidebar.activeItem === "MachineInfoPage"
            bg: sidebar.bg; bgCard: sidebar.bgCard; bgCardHover: sidebar.bgCardHover
            bgCardActive: sidebar.bgCardActive; iconColor: sidebar.iconColor
            iconHover: sidebar.iconHover; text: sidebar.text
            onClicked: sidebar.pageRequested("MachineInfoPage")
        }
        
        SidebarItem {
            iconText: "📡"
            labelText: "HMI32 Monitor"
            pageName: "Hmi32Monitor"
            isActive: sidebar.activeItem === "Hmi32Monitor"
            bg: sidebar.bg; bgCard: sidebar.bgCard; bgCardHover: sidebar.bgCardHover
            bgCardActive: sidebar.bgCardActive; iconColor: sidebar.iconColor
            iconHover: sidebar.iconHover; text: sidebar.text
            onClicked: sidebar.pageRequested("Hmi32Monitor")
        }

        SidebarItem {
            iconText: "📏"
            labelText: "A25 Sensor"
            pageName: "A25Sensor"
            isActive: sidebar.activeItem === "A25Sensor"
            bg: sidebar.bg; bgCard: sidebar.bgCard; bgCardHover: sidebar.bgCardHover
            bgCardActive: sidebar.bgCardActive; iconColor: sidebar.iconColor
            iconHover: sidebar.iconHover; text: sidebar.text
            onClicked: sidebar.pageRequested("A25Sensor")
        }
        
        SidebarItem {
            iconText: "💧"
            labelText: "Water Pressure"
            pageName: "WaterPressurePage"
            isActive: sidebar.activeItem === "WaterPressurePage"
            bg: sidebar.bg; bgCard: sidebar.bgCard; bgCardHover: sidebar.bgCardHover
            bgCardActive: sidebar.bgCardActive; iconColor: sidebar.iconColor
            iconHover: sidebar.iconHover; text: sidebar.text
            onClicked: sidebar.pageRequested("WaterPressurePage")
        }



        Item { Layout.fillWidth: true; Layout.fillHeight: true }

        Item {
            Layout.fillWidth: true
            Layout.preferredHeight: 80
            Layout.leftMargin: 12
            Layout.rightMargin: 12
            Layout.bottomMargin: 20

            Button {
                anchors.fill: parent
                text: appController.isFullscreen ? "LOG OUT" : "LOG IN"
                font.pixelSize: 14
                font.bold: true
                background: Rectangle {
                    color: parent.hovered ? sidebar.bgCardActive : sidebar.bgCardHover
                    border.color: sidebar.borderHover
                    border.width: 1
                }
                contentItem: Text {
                    text: parent.text
                    color: sidebar.text
                    font: parent.font
                    horizontalAlignment: Text.AlignHCenter
                    verticalAlignment: Text.AlignVCenter
                }
                onClicked: appController.isFullscreen ? appController.logout() : appController.loginFullscreen()
            }
        }
    }
}
