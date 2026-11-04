### 8路AHD demo编译环境安装

### qt安装

```shell
sudo apt update
sudo apt install build-essential -y
sudo apt install qt5-default qtcreator qtchooser  -y

sudo apt install qt5-qmake qtbase5-dev
```

---

### gstreamer安装

```shell
sudo apt update
sudo apt install libgstreamer1.0-dev libgstreamer-plugins-base1.0-dev -y
sudo apt install gstreamer1.0-plugins-base gstreamer1.0-plugins-good gstreamer1.0-plugins-bad gstreamer1.0-plugins-ugly -y
```

rk3568还需要设置加解密设备权限，参考《rk3568-opengl问题.md》