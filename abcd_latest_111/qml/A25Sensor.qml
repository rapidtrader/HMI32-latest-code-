import QtQuick 2.12
import QtQuick.Controls 2.12
import QtQuick.Layouts 1.12

Rectangle {
    id: a25SensorRoot
    color: root.bg
    anchors.fill: parent
    
    property int currentDistanceMm: 0  // Distance in mm
    property var rawData: []
    property var currentRawData: []
    property string statusText: "Waiting for A25 data..."
    property string debugInfo: ""
    
    // Calculate distance in cm
    property real currentDistanceCm: currentDistanceMm / 10.0
    
    function refreshData() {
        currentDistanceMm = machineBridge.getA25Distance()
        rawData = machineBridge.getA25RawData()
        currentRawData = machineBridge.getA25CurrentRawData()
        statusText = machineBridge.getA25Status()
        debugInfo = machineBridge.getA25DebugInfo()
    }
    
    Component.onCompleted: {
        refreshData()
        autoRefreshTimer.start()
    }
    
    Connections {
        target: machineBridge
        onA25Changed: refreshData()
    }
    
    Timer {
        id: autoRefreshTimer
        interval: 200  // Faster refresh for better debugging
        repeat: true
        onTriggered: refreshData()
    }
    
    ColumnLayout {
        anchors.fill: parent
        anchors.margins: 20
        spacing: 20
        Layout.alignment: Qt.AlignHCenter | Qt.AlignVCenter
        
        // Header
        Rectangle {
            Layout.fillWidth: true
            Layout.preferredHeight: 60
            color: root.bgCard
            border.color: root.border
            border.width: 2
            radius: 8
            
            Text {
                anchors.centerIn: parent
                text: "A25 Sensor Monitor"
                color: root.iconColor
                font.pixelSize: 28
                font.bold: true
            }
        }
        
        // Status
        Rectangle {
            Layout.fillWidth: true
            Layout.preferredHeight: 50
            color: {
                if (statusText === "Valid data") return "#1a3a2a"
                else if (statusText === "Waiting for A25 data...") return root.bgCard
                else return "#3a1a1a"
            }
            border.color: {
                if (statusText === "Valid data") return root.accentGreen
                else if (statusText === "Waiting for A25 data...") return root.border
                else return root.errorRed
            }
            border.width: 2
            radius: 8
            
            Text {
                anchors.centerIn: parent
                text: statusText
                color: {
                    if (statusText === "Valid data") return root.accentGreen
                    else if (statusText === "Waiting for A25 data...") return root.textDim
                    else return root.errorRed
                }
                font.pixelSize: 18
                font.bold: true
            }
        }
        
        // Distance Display
        Rectangle {
            Layout.fillWidth: true
            Layout.preferredHeight: 150
            color: root.bgCard
            border.color: root.iconColor
            border.width: 3
            radius: 12
            
            ColumnLayout {
                anchors.centerIn: parent
                spacing: 5
                
                Text {
                    text: "A25 Distance"
                    color: root.textDim
                    font.pixelSize: 20
                    Layout.alignment: Qt.AlignHCenter
                }
                
                Text {
                    id: distanceValue
                    text: currentDistanceCm.toFixed(1) + " cm"
                    color: root.iconColor
                    font.pixelSize: 60
                    font.bold: true
                    horizontalAlignment: Text.AlignHCenter
                    Layout.alignment: Qt.AlignHCenter
                }
            }
        }
        
        // Debug Info
        Rectangle {
            Layout.fillWidth: true
            Layout.preferredHeight: 60
            color: root.bgCard
            border.color: root.border
            border.width: 1
            radius: 6
            
            Text {
                anchors.fill: parent
                anchors.margins: 10
                text: debugInfo
                color: root.text
                font.pixelSize: 14
                font.family: "Courier New"
                wrapMode: Text.WordWrap
                verticalAlignment: Text.AlignVCenter
            }
        }
        
        // Raw Data Display
        Rectangle {
            Layout.fillWidth: true
            Layout.preferredHeight: 80
            color: root.bgCard
            border.color: root.border
            border.width: 2
            radius: 8
            
            ColumnLayout {
                anchors.fill: parent
                anchors.margins: 15
                spacing: 8
                
                Text {
                    text: "RAW CAN Data (ID 0x203)"
                    color: root.textDim
                    font.pixelSize: 16
                    Layout.alignment: Qt.AlignLeft
                }
                
                Text {
                    text: currentRawData.length > 0 ? currentRawData.map(b => b.toString(16).toUpperCase().padStart(2, '0')).join(" ") : "No data"
                    color: root.text
                    font.pixelSize: 18
                    font.family: "Courier New"
                    Layout.alignment: Qt.AlignLeft
                    Layout.fillWidth: true
                }
            }
        }
        
        Item {
            Layout.fillHeight: true
        }
    }
}
