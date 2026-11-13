// uart_test.cpp : 定义控制台应用程序的入口点。
//
#include <stdlib.h>
#include <string.h>
#include <stdio.h>
#include "gpsinfo.h"
#include "stdarg.h"
#include "math.h"


GPS_ASCLLINFO Ascll_Info[2] = {
    ASCLL_DATA_GPGGA, 0x06, RCV_GPGGA_HEAD,
    ASCLL_DATA_GPRMC, 0x06, RCV_GPRMC_HEAD

};

//GPS_ASCLLINFO Ascll_Info[4] = {
//    ASCLL_DATA_GPGGA, 0x06, RCV_GPGGA_HEAD,
//    ASCLL_DATA_GPRMC, 0x06, RCV_GPRMC_HEAD//,
//    //ASCLL_DATA_GNGGA, 0x06, RCV_GNGGA_HEAD,
//    //ASCLL_DATA_GNRMC, 0x06, RCV_GNRMC_HEAD

//};


BlkUartRcv blkUartRcv;
GPGGA_INFO gga_info;
GPRMC_INFO gmc_info;

//从buf里面得到第num个逗号所在的位置
//返回值:0~0xFE,代表逗号所在位置的偏移.
//       0xFF,代表不存在第num个逗号
u1 _Find_Pos(u1 *buf, u1 u1Num)
{
    u1 *p = buf;
    while (u1Num)
    {
        if (*buf == '*' || *buf<' ' || *buf>'z')return 0xFF;//遇到'*'或者非法字符,则不存在第num个逗号
        if (*buf == ',')u1Num--;
        buf++;
    }
    return buf - p;
}

//m^n函数
//返回值:m^n次方.
u4 _Pow(u1 m, u1 n)
{
    u4 result = 1;
    while (n--)result *= m;
    return result;
}
//str转换为数字,以','或者'*'结束
//buf:数字存储区
//dx:小数点位数,返回给调用函数
//返回值:转换后的数值
int _Str2num(u1 *buf, u1*dx)
{
    u1 *p = buf;
    u4 ires = 0, fres = 0;
    u1 ilen = 0, flen = 0, i;
    u1 mask = 0;
    double res;
    while (1) //得到整数和小数的长度
    {
        if (*p == '-'){ mask |= 0x02; p++; }//是负数
        if (*p == ',' || (*p == '*'))break;//遇到结束了
        if (*p == '.'){ mask |= 0x01; p++; }//遇到小数点了
        else if (*p>'9' || (*p<'0'))	//有非法字符
        {
            ilen = 0;
            flen = 0;
            break;
        }
        if (mask & 0x01)flen++;
        else ilen++;
        p++;
    }
    if (mask & 0x02)buf++;		//去掉负号
    for (i = 0; i<ilen; i++)	//得到整数部分数据
    {
        ires += _Pow(10, ilen - 1 - i)*(buf[i] - '0');
    }
    if (flen>5)flen = 5;	//最多取5位小数
    *dx = flen;	 			//小数点位数
    for (i = 0; i<flen; i++)	//得到小数部分数据
    {
        fres += _Pow(10, flen - 1 - i)*(buf[ilen + 1 + i] - '0');
    }
    res = ires*_Pow(10, flen) + fres;
    if (mask & 0x02)res = -res;
    return res;
}

//分析GPRMC信息
//buf:接收到的GPS数据缓冲区首地址
void _GPRMC_Analysis(GPRMC_INFO *gps_rmc_info, u1 *buf)
{
    u1 *p1, dx;
    u1 posx;
    u4 temp;
    //float rs;

    p1 = (u1*)strstr((const char *)buf, "$GPRMC");				// "$GPRMC"
    if (p1 == NULL){
        p1 = (u1*)strstr((const char *)buf, "$GNRMC");				// "$GNRMC" //add by ldp
        if (p1 == NULL){
            return;
        }
    }

    posx = _Find_Pos(p1, 1);									// 得到UTC时间
    if (posx != 0xFF){
        temp = _Str2num(p1 + posx, &dx) / _Pow(10, dx);			// 得到UTC时间,去掉ms
        gps_rmc_info->utc_time.hour = temp / 10000;
        gps_rmc_info->utc_time.min = (temp / 100) % 100;
        gps_rmc_info->utc_time.sec = temp % 100;
        gps_rmc_info->utc_time.ssec = _Str2num(p1 + posx, &dx) % _Pow(10, dx);
        printf("GPS UTC 小时：%d 分钟：%d 秒：%d 毫秒：%d \n\r",
            gps_rmc_info->utc_time.hour,
            gps_rmc_info->utc_time.min,
            gps_rmc_info->utc_time.sec,
            gps_rmc_info->utc_time.ssec);
    }

    posx = _Find_Pos(p1, 2);									// 得到定位状态
    if (posx != 0xFF){
        gps_rmc_info->gps_state = *(p1 + posx);
        printf("GPS卫星状态：%c \n\r", gps_rmc_info->gps_state);
    }

    posx = _Find_Pos(p1, 3);									// 得到纬度值
    if (posx != 0xFF){
        temp = _Str2num(p1 + posx, &dx);
        gps_rmc_info->latitude_value = (f8)temp / (f8)_Pow(10, dx);
        printf("GPS纬度值：%.5f \n\r", gps_rmc_info->latitude_value);
    }

    posx = _Find_Pos(p1, 4);									// 南纬还是北纬
    if (posx != 0xFF){
        gps_rmc_info->latitude = *(p1 + posx);
        printf("GPS纬度：%c \n\r", gps_rmc_info->latitude);
    }

    posx = _Find_Pos(p1, 5);									// 得到经度值
    if (posx != 0xFF){
        temp = _Str2num(p1 + posx, &dx);
        gps_rmc_info->longtitude_value = (f8)temp / (f8)_Pow(10, dx);
        printf("GPS经度值：%.5f \n\r", gps_rmc_info->longtitude_value);
    }

    posx = _Find_Pos(p1, 6);									// 东经还是西经
    if (posx != 0xFF){
        gps_rmc_info->longtitude = *(p1 + posx);
        printf("GPS经度：%c \n\r", gps_rmc_info->longtitude);
    }

    posx = _Find_Pos(p1, 7);									// 速度
    if (posx != 0xFF){
        temp = _Str2num(p1 + posx, &dx);
        gps_rmc_info->speed = (f4)temp / (f4)_Pow(10, dx);
        printf("GPS速度值：%.3f \n\r", gps_rmc_info->speed);
    }

    posx = _Find_Pos(p1, 8);									// 地面航向
    if (posx != 0xFF){
        temp = _Str2num(p1 + posx, &dx);
        gps_rmc_info->azimuth_angle = (f4)temp / (f4)_Pow(10, dx);
        printf("GPS速度值：%.3f \n\r", gps_rmc_info->azimuth_angle);
    }

    posx = _Find_Pos(p1, 9);									//得到UTC日期
    if (posx != 0xFF)
    {
        temp = _Str2num(p1 + posx, &dx);		 				//得到UTC日期
        gps_rmc_info->utc_time.date = temp / 10000;
        gps_rmc_info->utc_time.month = (temp / 100) % 100;
        gps_rmc_info->utc_time.year = 2000 + temp % 100;
        printf("GPS UTC 年：%d 月：%d 日：%d \n\r",
            gps_rmc_info->utc_time.year,
            gps_rmc_info->utc_time.month,
            gps_rmc_info->utc_time.date);
    }
}


//分析GPGGA信息
//buf:接收到的GPS数据缓冲区首地址
void _GPGGA_Analysis(GPGGA_INFO *gps_gga_info, u1 *buf)
{
    u1 *p1, dx;
    u1 posx;
    u4 temp=0;
    //float rs;

    p1 = (u1*)strstr((const char *)buf, "$GPGGA");				// "$GPRMC"
    if ( p1 == NULL ){
        p1 = (u1*)strstr((const char *)buf, "$GNGGA");				// "$GNRMC" //add by ldp
        if ( p1 == NULL ){
            return;
        }
    }

    posx = _Find_Pos(p1, 1);									// 得到UTC时间
    if (posx != 0xFF){
        temp = _Str2num(p1 + posx, &dx) / _Pow(10, dx);		// 得到UTC时间,去掉ms
        gps_gga_info->utc_time.hour = temp / 10000;
        gps_gga_info->utc_time.min = (temp / 100) % 100;
        gps_gga_info->utc_time.sec = temp % 100;
        gps_gga_info->utc_time.ssec = _Str2num(p1 + posx, &dx) % _Pow(10, dx);
        printf("GPS UTC 小时：%d 分钟：%d 秒：%d 毫秒：%d \n\r",
            gps_gga_info->utc_time.hour,
            gps_gga_info->utc_time.min,
            gps_gga_info->utc_time.sec,
            gps_gga_info->utc_time.ssec);
    }

    posx = _Find_Pos(p1, 2);									// 得到纬度值
    if (posx != 0xFF){
        temp = _Str2num(p1 + posx, &dx);
        gps_gga_info->latitude_value = (f8)temp / (f8)_Pow(10, dx);
        printf("GPS纬度值：%.5f \n\r", gps_gga_info->latitude_value);
    }

    posx = _Find_Pos(p1, 3);									// 南纬还是北纬
    if (posx != 0xFF){
        gps_gga_info->latitude = *(p1 + posx);
        printf("GPS纬度：%c \n\r", gps_gga_info->latitude);
    }

    posx = _Find_Pos(p1, 4);									// 得到经度值
    if (posx != 0xFF){
        temp = _Str2num(p1 + posx, &dx);
        gps_gga_info->longtitude_value = (f8)temp / (f8)_Pow(10, dx);
        printf("GPS经度值：%.5f \n\r", gps_gga_info->longtitude_value);
    }

    posx = _Find_Pos(p1, 5);									// 东经还是西经
    if (posx != 0xFF){
        gps_gga_info->longitude = *(p1 + posx);
        printf("GPS经度：%c \n\r", gps_gga_info->longitude);
    }

    posx = _Find_Pos(p1, 6);									// GPS状态
    if (posx != 0xFF){
        temp = _Str2num(p1 + posx, &dx);
        gps_gga_info->gps_state = temp;
        printf("GPS状态值：%d \n\r", gps_gga_info->gps_state);
    }

    posx = _Find_Pos(p1, 7);									// 卫星数量
    if (posx != 0xFF){
        temp = _Str2num(p1 + posx, &dx);
        gps_gga_info->sate_num = temp;
        printf("GPS卫星数量：%d \n\r", gps_gga_info->sate_num);
    }

    posx = _Find_Pos(p1, 8);									// HDOP水平精度因子
    if (posx != 0xFF){
        gps_gga_info->hdop = (f4)temp / (f4)_Pow(10, dx);
        printf("HDOP水平精度因子：%f \n\r", gps_gga_info->hdop);
    }

    posx = _Find_Pos(p1, 9);									// 海拔高度
    if (posx != 0xFF){
        temp = _Str2num(p1 + posx, &dx);
        gps_gga_info->altitude = (f4)temp / (f4)_Pow(10, dx);
        printf("海拔高度：%f \n\r", gps_gga_info->altitude);
    }
}


void _ResetUartRcvBuff()
{
    memset(&blkUartRcv, 0, sizeof(BlkUartRcv));
}

void GN_UartRcvGPSInfo(u1 u1Data)
{
    //int check, sum, hour, min, sec;
    BlkUartRcv	*pblkUartRcv = &blkUartRcv;
    u1			*pu1Buff = pblkUartRcv->u1RcvBuff;
    u1			u1size = 0;
    //char			u1utc[20];
    if ((u1Data == ASCLL_DATA_$) &&
        (pblkUartRcv->u1State == RCV_STATE_IDIE)){
        pblkUartRcv->u1State = RCV_STATE_START;
    }

    if (pblkUartRcv->u1DataLen >= MAX_RCV_SIZE){
        _ResetUartRcvBuff();
    }

    switch (pblkUartRcv->u1State){
    case RCV_STATE_START:
        pu1Buff[pblkUartRcv->u1DataLen++] = u1Data;
        if (u1Data == '\n'){
            for (u1size = 0; u1size < sizeof(Ascll_Info) / sizeof(GPS_ASCLLINFO); u1size++){
                if (CMP_SUCCESS == memcmp(&pu1Buff[0], Ascll_Info[u1size].u1AscllName, Ascll_Info[u1size].u1sizeof)){
                    _switchState(Ascll_Info[u1size].u1Head);
                }
            }
        }
        break;
    case RCV_GPGGA_HEAD:
   // case RCV_GNGGA_HEAD:

        printf("-----GPGGA------ \r\n");
        printf("GPGGA:%s \r\n",pu1Buff);
        _GPGGA_Analysis(&gga_info, pu1Buff);	// GPGGA解析函数
        _ResetUartRcvBuff();
        break;
    case RCV_GPRMC_HEAD:
   // case RCV_GNRMC_HEAD:

        printf("-----GPRMC------ \r\n");
        printf("GPRMC:%s \r\n", pu1Buff);
        _GPRMC_Analysis(&gmc_info, pu1Buff);	// GPRMC解析函数
        _ResetUartRcvBuff();
        break;
    default:
        break;
    }
//END:
    return;
}

int main_test_gps()
{
    // $GPGGA,105547.00,3959.99990484,N,11559.73608378,E,1,10,0.9,555.1075,M,-9.2296,M,,*7A\r\n
    // $GPRMC,105546.00,A,3959.99990614,N,11559.73608463,E,0.004,300.7,140622,5.7,W,A*22\r\n
//    u1 nema_gga[] = "$GPRMC,105546.000,A,3959.99990614,N,11559.73608463,E,0.004,300.7,140622,5.7,W,A*22\r\n $GADDA,105547.00,3959.99990484,N,11559.73608378,E,1,10,0.9,555.1075,M,-9.2296,M,,*7A\r\n $GPGGA,105547.00,3959.99990484,N,11559.73608378,E,1,10,0.9,555.1075,M,-9.2296,M,,*7A\r\n";

//    memset(&gmc_info, 0x00, sizeof(gmc_info));
//    int i = sizeof(nema_gga);

//    for (i = 0; i <= sizeof(nema_gga); i++){
//        GN_UartRcvGPSInfo(nema_gga[i]);
//    }

//    getchar();
    return 0x00;
}

void GpsInfoInit()
{
    _ResetUartRcvBuff();
    memset(&gmc_info, 0x00, sizeof(gmc_info));
    memset(&gga_info, 0x00, sizeof(gga_info));

}

int calcGpsInfo(char *inData, int inDatelen)
{
    printf("\n------inDatelen:%d\n", inDatelen);
    printf("%s", inData);
    printf("\n---------\n");

    for (int i = 0; i <= inDatelen; i++){
        GN_UartRcvGPSInfo(inData[i]);
    }
    //GN_UartRcvGPSInfo((u1 *)inData);
    return 0;
}
