#ifndef GPSINFO_H
#define GPSINFO_H


typedef   int				i4;
typedef   unsigned int		u4;
typedef   short             i2;
typedef   unsigned short    u2;
typedef   signed char		i1;
typedef   unsigned char     u1;
typedef   float             f4;
typedef   double			f8;


#define  ASCLL_DATA_$           '$'
#define  ASCLL_DATA_GPGGA       "$GPGGA"
#define  ASCLL_DATA_GPRMC       "$GPRMC"
//#define  ASCLL_DATA_GNGGA       "$GNGGA"
//#define  ASCLL_DATA_GNRMC       "$GNRMC"


#define  MAX_RCV_SIZE			1024*5
#define  GPGGA_HEAD_LEN			0x06
#define  CMP_SUCCESS			0x00
#define  CMP_ERROR				0x01

#define     _switchState(a)         pblkUartRcv->u1State = a

enum
{
    RCV_STATE_IDIE = 0,
    RCV_STATE_START,
    RCV_GPGGA_HEAD,
    RCV_GPRMC_HEAD,
    //RCV_GNGGA_HEAD,
   // RCV_GNRMC_HEAD,
};

typedef struct
{
    u1	u1AscllName[10];
    u1	u1sizeof;
    u1	u1Head;
}GPS_ASCLLINFO;
typedef struct UartRcvTag
{
    u1 u1RcvBuff[MAX_RCV_SIZE];
    u1 u1State = 0;
    u1 u1DataLen;
    u1 u1Len;
}BlkUartRcv;

//UTC时间信息
typedef struct
{
    u2 year;	//年份
    u1 month;	//月份
    u1 date;	//日期
    u1 hour; 	//小时
    u1 min; 	//分钟
    u1 sec; 	//秒钟
    u1 ssec;	//毫秒
}gps_utc_time;

typedef struct
{
    gps_utc_time	utc_time;			// UTC时间
    f8	latitude_value;					// 纬度
    u1	latitude;						// 纬度半球
    f8	longtitude_value;				// 经度
    u1	longitude;						// 经度半球
    u1	gps_state;						// GPS状态 0=未定位，1=非差分定位，2=差分定位，6=正在估算
    u1	sate_num;						// 解算位置卫星数量
    f4	hdop;							// HDOP水平精度因子
    f4	altitude;						// 海拔高度
}GPGGA_INFO;



typedef struct
 {
     gps_utc_time utc_time;		// UTC时间
     u1 gps_state;				// 定位状态
     f8 latitude_value;			// 纬度
     u1 latitude;				// 纬度半球
     f8 longtitude_value;		// 经度
     u1 longtitude;				// 经度半球
     f4 speed;					// 地面速率
     f4 azimuth_angle;			// 地面航向

}GPRMC_INFO;

int _Str2num(u1 *buf, u1*dx);

void _GPRMC_Analysis(GPRMC_INFO *gps_rmc_info, u1 *buf);
void _GPGGA_Analysis(GPGGA_INFO *gps_gga_info, u1 *buf);


void GpsInfoInit();


extern GPGGA_INFO gga_info;
extern GPRMC_INFO gmc_info;

int calcGpsInfo(char *inData, int inDatelen);


#endif // GPSINFO_H
