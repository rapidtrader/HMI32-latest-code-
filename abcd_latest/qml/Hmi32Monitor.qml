import QtQuick 2.12
import QtQuick.Controls 2.12
import QtQuick.Layouts 1.12

Rectangle {
    id: hmi32MonitorRoot
    color: root.bg
    anchors.fill: parent
    
    property var currentDistance: 0
    property var messageLog: []
    
    function refreshData() {
        currentDistance = machineBridge.getCurrentDistance()
        messageLog = machineBridge.getCanMessageLog()
    }
    
    Component.onCompleted: {
        refreshData()
        autoRefreshTimer.start()
    }
    
    Connections {
        target: machineBridge
        onDistanceChanged: refreshData()
        onCanMessageLogChanged: refreshData()
    }
    
    Timer {
        id: autoRefreshTimer
        interval: 500
        repeat: true
        onTriggered: refreshData()
    }
    
    ColumnLayout {
        anchors.fill: parent
        anchors.margins: 20
        spacing: 15
        
        // Header
        Rectangle {
            Layout.fillWidth: true
            Layout.preferredHeight: 60
            color: root.bgCard
            border.color: root.border
            border.width: 1
            radius: 4
            
            RowLayout {
                anchors.fill: parent
                anchors.margins: 15
                
                Text {
                    text: "HMI32 Real-Time Monitor"
                    color: root.iconColor
                    font.pixelSize: 24
                    font.bold: true
                    Layout.alignment: Qt.AlignLeft | Qt.AlignVCenter
                }
                
                Item {
                    Layout.fillWidth: true
                }
                
                Button {
                    id: refreshBtn
                    text: "🔄 Refresh"
                    font.pixelSize: 14
                    font.bold: true
                    Layout.preferredWidth: 120
                    Layout.preferredHeight: 40
                    
                    background: Rectangle {
                        color: refreshBtn.hovered ? root.bgCardHover : root.bgCardActive
                        border.color: root.borderHover
                        border.width: 2
                        radius: 4
                    }
                    
                    contentItem: Text {
                        text: refreshBtn.text
                        color: root.text
                        font: refreshBtn.font
                        horizontalAlignment: Text.AlignHCenter
                        verticalAlignment: Text.AlignVCenter
                    }
                    
                    onClicked: {
                        refreshData()
                        // Add a little pulse animation
                        refreshBtn.opacity = 0.6
                        refreshTimer.start()
                    }
                    
                    Timer {
                        id: refreshTimer
                        interval: 200
                        onTriggered: {
                            refreshBtn.opacity = 1
                        }
                    }
                }
            }
        }
        
      
        // Distance Display
        Rectangle {
            Layout.fillWidth: true
            Layout.preferredHeight: 100
            color: root.bgCard
            border.color: root.border
            border.width: 1
            radius: 4
            
            RowLayout {
                anchors.fill: parent
                anchors.margins: 20
                
                Text {
                    text: "Distance"
                    color: root.textDim
                    font.pixelSize: 18
                    Layout.alignment: Qt.AlignLeft | Qt.AlignVCenter
                }
                
                Item {
                    Layout.fillWidth: true
                }
                
                Rectangle {
                    id: distanceBox
                    width: 200
                    height: 60
                    color: "#0a1a2a"
                    border.color: root.iconColor
                    border.width: 2
                    radius: 4
                    Layout.alignment: Qt.AlignRight | Qt.AlignVCenter
                    
                    Text {
                        id: distanceValue
                        anchors.centerIn: parent
                        text: currentDistance + " cm"
                        color: root.iconColor
                        font.pixelSize: 28
                        font.bold: true
                        horizontalAlignment: Text.AlignHCenter
                        verticalAlignment: Text.AlignVCenter
                    }
                }
            }
        }
        
        // Message Log
        Rectangle {
            Layout.fillWidth: true
            Layout.fillHeight: true
            color: root.bgCard
            border.color: root.border
            border.width: 1
            radius: 4
            
            ColumnLayout {
                anchors.fill: parent
                anchors.margins: 15
                spacing: 10
                
                Text {
                    text: "CAN Message Log (Last " + messageLog.length + " Messages)"
                    color: root.textDim
                    font.pixelSize: 16
                    font.bold: true
                    Layout.alignment: Qt.AlignLeft
                }
                
                ScrollView {
                    Layout.fillWidth: true
                    Layout.fillHeight: true
                    clip: true
                    
                    ListView {
                        id: messageListView
                        model: messageLog
                        spacing: 5
                        clip: true
                        
                        delegate: Rectangle {
                    width: parent.width
                    height: 50
                    color: {
                        if (modelData.error) {
                            return "#3a0a0a"  // Red for error
                        } else if (modelData.type === "distance") {
                            return index % 2 === 0 ? "#0a1621" : root.bg
                        } else {
                            return modelData.state ? "#0a3a1a" : (index % 2 === 0 ? "#0a1621" : root.bg) // Green row when ON!
                        }
                    }
                    radius: 3
                    border.color: modelData.error ? "#ff4444" : root.border
                    border.width: 1
                    
                    RowLayout {
                        anchors.fill: parent
                        anchors.margins: 8
                        spacing: 10
                        
                        Text {
                            text: modelData.timestamp
                            color: root.textDim
                            font.pixelSize: 12
                            font.family: "Courier New"
                            Layout.preferredWidth: 110
                            Layout.alignment: Qt.AlignVCenter
                        }
                        
                        Rectangle {
                            width: 60
                            height: 26
                            radius: 4
                            color: {
                                if (modelData.error) {
                                    return "#aa0000"  // Red for error
                                } else if (modelData.type === "distance") {
                                    return "#1a3a2a"
                                } else {
                                    return modelData.state ? "#005a2a" : "#2a3a1a" // Green when ON!
                                }
                            }
                            Layout.alignment: Qt.AlignVCenter
                            
                            Text {
                                anchors.centerIn: parent
                                text: modelData.type === "distance" ? "DIST" : "GPIO"
                                color: {
                                    if (modelData.error) {
                                        return "#ffaaaa"  // Light red for error
                                    } else if (modelData.type === "distance") {
                                        return "#00e676"
                                    } else {
                                        return modelData.state ? "#00ff77" : "#ff9500"
                                    }
                                }
                                font.pixelSize: 11
                                font.bold: true
                            }
                        }
                        
                        Text {
                            text: {
                                if (modelData.type === "distance") {
                                    return "0x" + modelData.arbitration_id.toString(16).toUpperCase().padStart(3, '0') + " → " + modelData.value + " cm"
                                } else {
                                    return "0x" + modelData.arbitration_id.toString(16).toUpperCase().padStart(3, '0') + " → " + (modelData.name || "Unknown") + " (" + (modelData.pin || "???") + ") " + (modelData.state ? "ON" : "OFF") + (modelData.error ? " (ERROR: " + modelData.error_msg + ")" : "")
                                }
                            }
                            color: modelData.error ? "#ff8888" : root.text
                            font.pixelSize: 13
                            Layout.fillWidth: true
                            elide: Text.ElideRight
                            Layout.alignment: Qt.AlignVCenter
                        }
                        
                        Text {
                            text: "[" + modelData.data.join(" ") + "]"
                            color: root.textDim
                            font.pixelSize: 11
                            font.family: "Courier New"
                            Layout.alignment: Qt.AlignVCenter
                        }
                    }
                }
                    }
                }
            }
        }
    }
}
