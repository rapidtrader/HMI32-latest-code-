// Copyright (c) 2023 by Rockchip Electronics Co., Ltd. All Rights Reserved.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

/*-------------------------------------------
                Includes
-------------------------------------------*/
#include <dlfcn.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>
#include <sys/time.h>

#include <iostream>
#include <queue>

#include <gst/gst.h>
#include <gst/gstpad.h>
#include <gst/gstmessage.h>
#include <gst/app/gstappsrc.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#include "im2d.h"
#include "rga.h"
#include "RgaUtils.h"

#include "opencv2/core/core.hpp"
#include "opencv2/imgcodecs.hpp"
#include "opencv2/imgproc.hpp"
#include <opencv2/opencv.hpp>
#include <opencv2/opencv.hpp>


#include <opencv/cv.hpp>
#include <opencv2/core/core.hpp>
#include <opencv2/highgui/highgui.hpp>


#include "rknn_api.h"
#include "postprocess.h"

#include "utils/mpp_decoder.h"
#include "utils/mpp_encoder.h"
#include "utils/drawing.h"

#define BUILD_VIDEO_RTSP

#if defined(BUILD_VIDEO_RTSP)
#include "mk_mediakit.h"
#endif

#define OUT_VIDEO_PATH "out.h264"

typedef struct {
  rknn_context rknn_ctx;
  rknn_input_output_num io_num;
  rknn_tensor_attr* input_attrs;
  rknn_tensor_attr* output_attrs;
  int model_channel;
  int model_width;
  int model_height;
  FILE* out_fp;
  MppDecoder* decoder;
  MppEncoder* encoder;
} rknn_app_context_t;

typedef struct {
  int width;
  int height;
  int width_stride;
  int height_stride;
  int format;
  char* virt_addr;
  int fd;
} image_frame_t;

/*-------------------------------------------
                  Functions
-------------------------------------------*/

static void dump_tensor_attr(rknn_tensor_attr* attr)
{
  printf("  index=%d, name=%s, n_dims=%d, dims=[%d, %d, %d, %d], n_elems=%d, size=%d, fmt=%s, type=%s, qnt_type=%s, "
         "zp=%d, scale=%f\n",
         attr->index, attr->name, attr->n_dims, attr->dims[0], attr->dims[1], attr->dims[2], attr->dims[3],
         attr->n_elems, attr->size, get_format_string(attr->fmt), get_type_string(attr->type),
         get_qnt_type_string(attr->qnt_type), attr->zp, attr->scale);
}

double __get_us(struct timeval t) { return (t.tv_sec * 1000000 + t.tv_usec); }

static unsigned char* load_data(FILE* fp, size_t ofst, size_t sz)
{
  unsigned char* data;
  int ret;

  data = NULL;

  if (NULL == fp) {
    return NULL;
  }

  ret = fseek(fp, ofst, SEEK_SET);
  if (ret != 0) {
    printf("blob seek failure.\n");
    return NULL;
  }

  data = (unsigned char*)malloc(sz);
  if (data == NULL) {
    printf("buffer malloc failure.\n");
    return NULL;
  }
  ret = fread(data, 1, sz, fp);
  return data;
}

static unsigned char* read_file_data(const char* filename, int* model_size)
{
  FILE* fp;
  unsigned char* data;

  fp = fopen(filename, "rb");
  if (NULL == fp) {
    printf("Open file %s failed.\n", filename);
    return NULL;
  }

  fseek(fp, 0, SEEK_END);
  int size = ftell(fp);

  data = load_data(fp, 0, size);

  fclose(fp);

  *model_size = size;
  return data;
}

static int write_data_to_file(const char *path, char *data, unsigned int size) {
  FILE *fp;

  fp = fopen(path, "w");
  if(fp == NULL) {
    printf("open error: %s", path);
    return -1;
  }

  fwrite(data, 1, size, fp);
  fflush(fp);

  fclose(fp);
  return 0;
}

static int init_model(const char* model_path, rknn_app_context_t* app_ctx) {
  int ret;
  rknn_context ctx;

  /* Create the neural network */
  printf("Loading mode...\n");
  int model_data_size = 0;
  unsigned char* model_data = read_file_data(model_path, &model_data_size);
  if (model_data == NULL) {
    return -1;
  }

  ret = rknn_init(&ctx, model_data, model_data_size, 0, NULL);
  if (ret < 0) {
    printf("rknn_init error ret=%d\n", ret);
    return -1;
  }

  if (model_data) {
    free(model_data);
  }

  rknn_sdk_version version;
  ret = rknn_query(ctx, RKNN_QUERY_SDK_VERSION, &version, sizeof(rknn_sdk_version));
  if (ret < 0) {
    printf("rknn_query RKNN_QUERY_SDK_VERSION error ret=%d\n", ret);
    return -1;
  }
  printf("sdk version: %s driver version: %s\n", version.api_version, version.drv_version);

  ret = rknn_query(ctx, RKNN_QUERY_IN_OUT_NUM, &app_ctx->io_num, sizeof(rknn_input_output_num));
  if (ret < 0) {
    printf("rknn_query RKNN_QUERY_IN_OUT_NUM error ret=%d\n", ret);
    return -1;
  }
  printf("model input num: %d, output num: %d\n", app_ctx->io_num.n_input, app_ctx->io_num.n_output);

  rknn_tensor_attr* input_attrs = (rknn_tensor_attr*)malloc(app_ctx->io_num.n_input * sizeof(rknn_tensor_attr));
  memset(input_attrs, 0, sizeof(input_attrs));
  for (int i = 0; i < app_ctx->io_num.n_input; i++) {
    input_attrs[i].index = i;
    ret = rknn_query(ctx, RKNN_QUERY_INPUT_ATTR, &(input_attrs[i]), sizeof(rknn_tensor_attr));
    if (ret < 0) {
      printf("rknn_query RKNN_QUERY_INPUT_ATTR error ret=%d\n", ret);
      return -1;
    }
    dump_tensor_attr(&(input_attrs[i]));
  }

  rknn_tensor_attr* output_attrs = (rknn_tensor_attr*)malloc(app_ctx->io_num.n_output * sizeof(rknn_tensor_attr));
  memset(output_attrs, 0, sizeof(output_attrs));
  for (int i = 0; i < app_ctx->io_num.n_output; i++) {
    output_attrs[i].index = i;
    ret = rknn_query(ctx, RKNN_QUERY_OUTPUT_ATTR, &(output_attrs[i]), sizeof(rknn_tensor_attr));
    if (ret < 0) {
      printf("rknn_query RKNN_QUERY_OUTPUT_ATTR error ret=%d\n", ret);
      return -1;
    }
    dump_tensor_attr(&(output_attrs[i]));
  }

  app_ctx->input_attrs = input_attrs;
  app_ctx->output_attrs = output_attrs;
  app_ctx->rknn_ctx = ctx;

  if (input_attrs[0].fmt == RKNN_TENSOR_NCHW) {
    printf("model is NCHW input fmt\n");
    app_ctx->model_channel = input_attrs[0].dims[1];
    app_ctx->model_height  = input_attrs[0].dims[2];
    app_ctx->model_width   = input_attrs[0].dims[3];
  } else {
    printf("model is NHWC input fmt\n");
    app_ctx->model_height  = input_attrs[0].dims[1];
    app_ctx->model_width   = input_attrs[0].dims[2];
    app_ctx->model_channel = input_attrs[0].dims[3];
  }
  printf("model input height=%d, width=%d, channel=%d\n", app_ctx->model_height, app_ctx->model_width, app_ctx->model_channel);

  return 0;
}

static int release_model(rknn_app_context_t* app_ctx) {
  if (app_ctx->rknn_ctx != NULL) {
    rknn_destroy(app_ctx->rknn_ctx);
  }
  free(app_ctx->input_attrs);
  free(app_ctx->output_attrs);
  deinitPostProcess();
  return 0;
}

static int inference_model(rknn_app_context_t* app_ctx, image_frame_t* img, detect_result_group_t* detect_result) {
  int ret;
  rknn_context ctx = app_ctx->rknn_ctx;
  int model_width = app_ctx->model_width;
  int model_height = app_ctx->model_height;
  int model_channel = app_ctx->model_channel;

  struct timeval start_time, stop_time;
  const float    nms_threshold      = NMS_THRESH;
  const float    box_conf_threshold = BOX_THRESH;
  // You may not need resize when src resulotion equals to dst resulotion
  void* resize_buf = nullptr;
  // init rga context
  rga_buffer_t src;
  rga_buffer_t dst;
  im_rect      src_rect;
  im_rect      dst_rect;
  memset(&src_rect, 0, sizeof(src_rect));
  memset(&dst_rect, 0, sizeof(dst_rect));
  memset(&src, 0, sizeof(src));
  memset(&dst, 0, sizeof(dst));

  printf("input image %dx%d stride %dx%d format=%d\n", img->width, img->height, img->width_stride, img->height_stride, img->format);

  float scale_w = (float)model_width / img->width;
  float scale_h = (float)model_height / img->height;

  rknn_input inputs[1];
  memset(inputs, 0, sizeof(inputs));
  inputs[0].index        = 0;
  inputs[0].type         = RKNN_TENSOR_UINT8;
  inputs[0].size         = model_width * model_height * model_channel;
  inputs[0].fmt          = RKNN_TENSOR_NHWC;
  inputs[0].pass_through = 0;

  printf("resize with RGA!\n");
  resize_buf = malloc(model_width * model_height * model_channel);
  memset(resize_buf, 0, model_width * model_height * model_channel);

  src = wrapbuffer_virtualaddr((void*)img->virt_addr, img->width, img->height, img->format, img->width_stride, img->height_stride);
  dst = wrapbuffer_virtualaddr((void*)resize_buf, model_width, model_height, RK_FORMAT_RGB_888);
  ret = imcheck(src, dst, src_rect, dst_rect);
  if (IM_STATUS_NOERROR != ret) {
    printf("%d, check error! %s", __LINE__, imStrError((IM_STATUS)ret));
    return -1;
  }
  IM_STATUS STATUS = imresize(src, dst);

  inputs[0].buf = resize_buf;

  gettimeofday(&start_time, NULL);
  rknn_inputs_set(ctx, app_ctx->io_num.n_input, inputs);

  rknn_output outputs[app_ctx->io_num.n_output];
  memset(outputs, 0, sizeof(outputs));
  for (int i = 0; i < app_ctx->io_num.n_output; i++) {
    outputs[i].want_float = 0;
  }

  ret = rknn_run(ctx, NULL);
  ret = rknn_outputs_get(ctx, app_ctx->io_num.n_output, outputs, NULL);
  gettimeofday(&stop_time, NULL);
  printf("once run use %f ms\n", (__get_us(stop_time) - __get_us(start_time)) / 1000);

  printf("post process config: box_conf_threshold = %.2f, nms_threshold = %.2f\n", box_conf_threshold, nms_threshold);

  std::vector<float> out_scales;
  std::vector<int32_t> out_zps;
  for (int i = 0; i < app_ctx->io_num.n_output; ++i) {
    out_scales.push_back(app_ctx->output_attrs[i].scale);
    out_zps.push_back(app_ctx->output_attrs[i].zp);
  }

  post_process((int8_t*)outputs[0].buf, (int8_t*)outputs[1].buf, (int8_t*)outputs[2].buf, model_height, model_width,
               box_conf_threshold, nms_threshold, scale_w, scale_h, out_zps, out_scales, detect_result);
  ret = rknn_outputs_release(ctx, app_ctx->io_num.n_output, outputs);

  if (resize_buf) {
    free(resize_buf);
  }
  return 0;
}

//add by ldp
void text_to_yuv420p(const char* text, int w, int h,  char* output_data, int outLen) {
    int text_x=0,  text_y=0;
    // 创建一个临时RGB图像
    cv::Mat rgb_image(h, w, CV_8UC3, cv::Scalar(0, 0, 0)); // 初始化为黑色

    // 在RGB图像上绘制文本
    cv::putText(rgb_image, text, cv::Point(text_x, text_y), cv::FONT_HERSHEY_SIMPLEX, 1.0, cv::Scalar(255, 255, 255), 2);

    // 将RGB图像转换为YUV420P格式
    cv::Mat yuv_image;
    cv::cvtColor(rgb_image, yuv_image, cv::COLOR_RGB2YUV_I420);

    if(outLen > yuv_image.total()){
      memcpy(output_data, yuv_image.data, yuv_image.total());
      }else{
        memcpy(output_data, yuv_image.data, outLen);
      }

    // // 保存YUV420P图像到文件
    // FILE* file = fopen(output_file, "wb");
    // if (file) {
    //     fwrite(yuv_image.data, 1, yuv_image.total(), file);
    //     fclose(file);
    // } else {
    //     fprintf(stderr, "Error: Unable to open output file!\n");
    // }
}

#if 1
// 将RGB图像转换为YUV420SP（NV12）格式
void convert_rgb_to_yuv420sp(const cv::Mat  rgb, uint8_t *yuv420sp) {
    cv::Mat yuv420p;
    cvtColor(rgb, yuv420p, cv::COLOR_RGB2YUV_I420);

    int width = rgb.cols;
    int height = rgb.rows;
    int frameSize = width * height;

    // Y平面
    memcpy(yuv420sp, yuv420p.data, frameSize);

    // UV平面
    uint8_t *u_plane = yuv420p.data + frameSize;
    uint8_t *v_plane = yuv420p.data + frameSize + frameSize / 4;
    uint8_t *uv_plane = yuv420sp + frameSize;

    for (int i = 0; i < frameSize / 4; i++) {
        uv_plane[2 * i] = u_plane[i];
        uv_plane[2 * i + 1] = v_plane[i];
    }
}

void draw_text_on_image(const char *text, int width, int height, uint8_t *yuv420sp) {
    // 创建一个RGB图像
    cv::Mat rgb_image(height, width, CV_8UC3, cv::Scalar(0, 0, 0));

    // 设置文本属性
    int font_face = cv::FONT_HERSHEY_SIMPLEX;
    double font_scale = 1.0;
    int thickness = 2;
    int baseline = 0;

    // 获取文本大小
    cv::Size text_size = cv::getTextSize(text, font_face, font_scale, thickness, &baseline);

    // 计算文本位置
    cv::Point text_org((width - text_size.width) / 2, (height + text_size.height) / 2);

    // 在RGB图像上绘制文本
    putText(rgb_image, text, text_org, font_face, font_scale, cv::Scalar(255, 255, 255), thickness);


    // 保存图像到文件
    // std::string filename = "output_image.png"; // 文件名
    // if (cv::imwrite(filename, rgb_image)) {
    //     std::cout << "图像已成功保存为 " << filename << std::endl;
    // } else {
    //     std::cerr << "图像保存失败！" << std::endl;
    // }


    // 将RGB图像转换为YUV420SP格式
    convert_rgb_to_yuv420sp(rgb_image, yuv420sp);
}
#endif

#define MY_FONT_SIZE  20 //20
#define GST_PALY_VIDEO 1

struct frame_yuv420sp{
  char *frameP;
  int size;
  guint64 pts;
};

guint64 old_pts=0;

//cv::Mat yuvImage;
// cv::Mat bgrImage;

// void showYUV420SP(const unsigned char* yuv, int width, int height) 
// {
//     // // 创建 YUV420SP 图像的 Mat 对象
//     // cv::Mat yuvImage(height + height / 2, width, CV_8UC1, (void*)yuv);

//     // // 将 YUV420SP 转换为 BGR 格式
//     // //cv::Mat bgrImage;
//     // cv::cvtColor(yuvImage, bgrImage, cv::COLOR_YUV420sp2BGR);
//     // cv::imshow((char *)"test", bgrImage);
//     // // 显示图像
//     // //cv::imshow("YUV420SP ", bgrImage);
//     // //cv::waitKey(0); // 等待按键
// }


//  std::queue<> myQueue;
  // 定义字节数组类型
//using ByteArray = std::vector<struct frame_yuv420sp>;
std::queue<struct frame_yuv420sp> myFrameQueue;


#define USE_H264  0


void mpp_decoder_frame_callback(void* userdata, int width_stride, int height_stride, int width, int height, int format, int fd, void* data) {

  rknn_app_context_t* ctx = (rknn_app_context_t*)userdata;
  void* mpp_frame_addr = NULL;

  int ret = 0;
  int enc_buf_size = width_stride*height_stride*3/2;


  detect_result_group_t detect_result;
  memset(&detect_result, 0, sizeof(detect_result_group_t));


  image_frame_t img;
  img.width = width;
  img.height = height;
  img.width_stride = width_stride;
  img.height_stride = height_stride;
  img.fd = fd;
  img.virt_addr = (char*)data;
  img.format = RK_FORMAT_YCbCr_420_SP;

  ret = inference_model(ctx, &img, &detect_result);
  if (ret != 0) {
    printf("inference model fail\n");
    return ;//goto RET;
  }
    printf("frame_yuv420sp width_stride=%d  height_stride=%d\r\n", width_stride, height_stride);

  mpp_frame_addr = data ;//mpp_buffer_get_ptr(data);
  // Draw objects
  for (int i = 0; i < detect_result.count; i++) {
    detect_result_t* det_result = &(detect_result.results[i]);
    printf("%s @ (%d %d %d %d) %f\n", det_result->name, det_result->box.left, det_result->box.top,
           det_result->box.right, det_result->box.bottom, det_result->prop);
    int x1 = det_result->box.left;
    int y1 = det_result->box.top;
    int x2 = det_result->box.right;
    int y2 = det_result->box.bottom;
    draw_rectangle_yuv420sp((unsigned char*)mpp_frame_addr, width_stride, height_stride, x1, y1, x2-x1+1, y2-y1+1, 0x00FF0000, 4);

#if 1

    char img_text[80*1024]={0}; //add by ldp
    char textbuf[256]={0};
    snprintf(textbuf, sizeof(textbuf), "%s %.02f", det_result->name, det_result->prop);

    memset(img_text, 0x00, sizeof(img_text));
    //text_to_yuv420p(det_result->name, 10*strlen(det_result->name), 20, img_text, sizeof(img_text));
    draw_text_on_image(textbuf, MY_FONT_SIZE*strlen(textbuf), MY_FONT_SIZE+10, (uint8_t *)img_text);


    draw_image_yuv420sp((unsigned char*)mpp_frame_addr, width_stride, height_stride,  (unsigned char*)img_text, x1, y1, MY_FONT_SIZE*strlen(textbuf), MY_FONT_SIZE+10);
    //    putText(orig_img, text, cv::Point(x1, y1 + 12), cv::FONT_HERSHEY_SIMPLEX, 0.5, cv::Scalar(0, 0, 0));
#endif
  }

  static int frame_index = 0;
  frame_index++;

  if (frame_index == 1) {
    old_pts = gst_clock_get_time(gst_system_clock_obtain());

  }
  struct frame_yuv420sp frame;
  //printf("frame_yuv420sp frame\r\n");
  frame.frameP =  (char *)malloc(enc_buf_size);

  memcpy(frame.frameP, mpp_frame_addr, enc_buf_size);
  frame.size = enc_buf_size;
  frame.pts = gst_clock_get_time(gst_system_clock_obtain())-old_pts;
  old_pts = gst_clock_get_time(gst_system_clock_obtain());
  myFrameQueue.push(frame);
  printf(" myFrameQueue.push size=%d\r\n", frame.size);

}

void mpp_decoder_frame_callback_back(void* userdata, int width_stride, int height_stride, int width, int height, int format, int fd, void* data) {

  rknn_app_context_t* ctx = (rknn_app_context_t*)userdata;

  int ret = 0;
  static int frame_index = 0;
  frame_index++;

  void* mpp_frame = NULL;
  int mpp_frame_fd = 0;
  void* mpp_frame_addr = NULL;
  int enc_data_size;

  rga_buffer_t origin;
  rga_buffer_t src;

  if (ctx->encoder == NULL) {
    MppEncoder* mpp_encoder = new MppEncoder();
    MppEncoderParams enc_params;
    memset(&enc_params, 0, sizeof(MppEncoderParams));
    enc_params.width = width;
    enc_params.height = height;
    enc_params.hor_stride = width_stride;
    enc_params.ver_stride = height_stride;
    enc_params.fmt = MPP_FMT_YUV420SP;
    //enc_params.type = MPP_VIDEO_CodingHEVC;
    //Note: rk3562只能支持h264格式的视频流
    enc_params.type = MPP_VIDEO_CodingAVC;
    mpp_encoder->Init(enc_params, NULL);

    ctx->encoder = mpp_encoder;
  }

  int enc_buf_size = ctx->encoder->GetFrameSize();
  char* enc_data = (char*)malloc(enc_buf_size);

  image_frame_t img;
  img.width = width;
  img.height = height;
  img.width_stride = width_stride;
  img.height_stride = height_stride;
  img.fd = fd;
  img.virt_addr = (char*)data;
  img.format = RK_FORMAT_YCbCr_420_SP;


  detect_result_group_t detect_result;
  memset(&detect_result, 0, sizeof(detect_result_group_t));

  ret = inference_model(ctx, &img, &detect_result);
  if (ret != 0) {
    printf("inference model fail\n");
    goto RET;
  }

  mpp_frame = ctx->encoder->GetInputFrameBuffer();
  mpp_frame_fd = ctx->encoder->GetInputFrameBufferFd(mpp_frame);
  mpp_frame_addr = ctx->encoder->GetInputFrameBufferAddr(mpp_frame);

  // Copy To another buffer avoid to modify mpp decoder buffer
  origin = wrapbuffer_fd(fd, width, height, RK_FORMAT_YCbCr_420_SP, width_stride, height_stride);
  src = wrapbuffer_fd(mpp_frame_fd, width, height, RK_FORMAT_YCbCr_420_SP, width_stride, height_stride);
  imcopy(origin, src);



  // Draw objects
  for (int i = 0; i < detect_result.count; i++) {
    detect_result_t* det_result = &(detect_result.results[i]);
    printf("%s @ (%d %d %d %d) %f\n", det_result->name, det_result->box.left, det_result->box.top,
           det_result->box.right, det_result->box.bottom, det_result->prop);
    int x1 = det_result->box.left;
    int y1 = det_result->box.top;
    int x2 = det_result->box.right;
    int y2 = det_result->box.bottom;
    draw_rectangle_yuv420sp((unsigned char*)mpp_frame_addr, width_stride, height_stride, x1, y1, x2-x1+1, y2-y1+1, 0x00FF0000, 4);

#if 1

    char img_text[80*1024]={0}; //add by ldp
    char textbuf[256]={0};
    snprintf(textbuf, sizeof(textbuf), "%s %.02f", det_result->name, det_result->prop);

    memset(img_text, 0x00, sizeof(img_text));
    //text_to_yuv420p(det_result->name, 10*strlen(det_result->name), 20, img_text, sizeof(img_text));
    draw_text_on_image(textbuf, MY_FONT_SIZE*strlen(textbuf), MY_FONT_SIZE+10, (uint8_t *)img_text);

    printf("frame_yuv420sp width_stride=%d  height_stride=%d\r\n", width_stride, height_stride);

    draw_image_yuv420sp((unsigned char*)mpp_frame_addr, width_stride, height_stride,  (unsigned char*)img_text, x1, y1, MY_FONT_SIZE*strlen(textbuf), MY_FONT_SIZE+10);
    //    putText(orig_img, text, cv::Point(x1, y1 + 12), cv::FONT_HERSHEY_SIMPLEX, 0.5, cv::Scalar(0, 0, 0));
#endif
  }

#if !GST_PALY_VIDEO
  // Encode to file
  // Write header on first frame
  if (frame_index == 1) {
    enc_data_size = ctx->encoder->GetHeader(enc_data, enc_buf_size);
    fwrite(enc_data, 1, enc_data_size, ctx->out_fp);
  }
  memset(enc_data, 0, enc_buf_size);
  enc_data_size = ctx->encoder->Encode(mpp_frame, enc_data, enc_buf_size);
  fwrite(enc_data, 1, enc_data_size, ctx->out_fp);
#else

#if USE_H264
  struct timeval start_time, stop_time;
    printf("frame_yuv420sp frame_index=%d\r\n", frame_index);
  if (frame_index == 1) {
    struct frame_yuv420sp frame;
    frame.frameP =  (char *)malloc(enc_buf_size);
    //memcpy(frame.frameP, enc_data, enc_data_size);
    enc_data_size = ctx->encoder->GetHeader(frame.frameP, enc_buf_size);
    //fwrite(enc_data, 1, enc_data_size, ctx->out_fp);
    frame.size = enc_data_size;
    frame.pts = 0;
    old_pts = gst_clock_get_time(gst_system_clock_obtain());
    myFrameQueue.push(frame);
    printf("frame_yuv420sp myFrameQueue.push\r\n");
    //fwrite(frame.frameP, 1, enc_data_size, ctx->out_fp);

  }
  memset(enc_data, 0, enc_buf_size);

  gettimeofday(&start_time, NULL);
  //printf("once run use %f ms\n", (__get_us(stop_time) - __get_us(start_time)) / 1000);

  struct frame_yuv420sp frame;
  //printf("frame_yuv420sp frame\r\n");
  frame.frameP =  (char *)malloc(enc_buf_size);

  enc_data_size = ctx->encoder->Encode(mpp_frame, frame.frameP, enc_buf_size);
  //fwrite(enc_data, 1, enc_data_size, ctx->out_fp);
  //memcpy(frame.frameP, enc_data, enc_data_size);
  frame.size = enc_data_size;enc_buf_size
  frame.pts = gst_clock_get_time(gst_system_clock_obtain())-old_pts;
  old_pts = gst_clock_get_time(gst_system_clock_obtain());
  myFrameQueue.push(frame);
  //fwrite(frame.frameP, 1, enc_data_size, ctx->out_fp);

  gettimeofday(&stop_time, NULL);
  printf("myFrameQueue.push use %f ms\n", (__get_us(stop_time) - __get_us(start_time)) / 1000);

  printf(" myFrameQueue.push size=%d\r\n", enc_data_size);
#else

  if (frame_index == 1) {
    old_pts = gst_clock_get_time(gst_system_clock_obtain());

  }
  struct frame_yuv420sp frame;
  //printf("frame_yuv420sp frame\r\n");
  frame.frameP =  (char *)malloc(enc_buf_size);

  memcpy(frame.frameP, mpp_frame_addr, enc_buf_size);
  frame.size = enc_buf_size;
  frame.pts = gst_clock_get_time(gst_system_clock_obtain())-old_pts;
  old_pts = gst_clock_get_time(gst_system_clock_obtain());
  myFrameQueue.push(frame);
  printf(" myFrameQueue.push size=%d\r\n", frame.size);

#endif

#endif

RET:
  if (enc_data != nullptr) {
    free(enc_data);
  }
}

int process_video_file(rknn_app_context_t* ctx, const char* path)
{
  int video_size;
  char* video_data = (char*)read_file_data(path, &video_size);
  char* video_data_end = video_data + video_size;
  printf("read video size=%d\n", video_size);

  const int SIZE = 8192;
  char* video_data_ptr = video_data;

  do {
      int pkt_eos = 0;
      int size = SIZE;
      if (video_data_ptr + size >= video_data_end) {
          pkt_eos = 1;
          size = video_data_end - video_data_ptr;
      }

      ctx->decoder->Decode((uint8_t*)video_data_ptr, size, pkt_eos);

      video_data_ptr += size;

      if (video_data_ptr >= video_data_end) {
          printf("reset decoder\n");
          break;
      }

      // LOGD("video_data_ptr=%p video_data_end=%p", video_data_ptr, video_data_end);
      // usleep(10*1000);
  } while (1);

  return 0;
}


#if defined(BUILD_VIDEO_RTSP)
void API_CALL on_track_frame_out(void *user_data, mk_frame frame) {
  rknn_app_context_t *ctx = (rknn_app_context_t *) user_data;
  printf("on_track_frame_out ctx=%p\n", ctx);
  const char* data = mk_frame_get_data(frame);
  size_t size = mk_frame_get_data_size(frame);
  printf("decoder=%p\n", ctx->decoder);
  ctx->decoder->Decode((uint8_t*)data, size, 0);
}

void API_CALL on_mk_play_event_func(void *user_data, int err_code, const char *err_msg, mk_track tracks[],
                                    int track_count) {
  rknn_app_context_t *ctx = (rknn_app_context_t *) user_data;
  if (err_code == 0) {
      //success
      printf("play success!");
      int i;
      for (i = 0; i < track_count; ++i) {
          if (mk_track_is_video(tracks[i])) {
              log_info("got video track: %s", mk_track_codec_name(tracks[i]));
              //监听track数据回调
              mk_track_add_delegate(tracks[i], on_track_frame_out, user_data);
          }
      }
  } else {
      printf("play failed: %d %s", err_code, err_msg);
  }
}

void API_CALL on_mk_shutdown_func(void *user_data, int err_code, const char *err_msg, mk_track tracks[], int track_count) {
  printf("play interrupted: %d %s", err_code, err_msg);
}

int main_play_yuv420sp();
int gst_main();
int main_h264();

int process_video_rtsp(rknn_app_context_t* ctx, const char* url)
{
  mk_config config;
  memset(&config, 0, sizeof(mk_config));
  config.log_mask = LOG_CONSOLE;
  mk_env_init(&config);
  mk_player player = mk_player_create();
  mk_player_set_on_result(player, on_mk_play_event_func, ctx);
  mk_player_set_on_shutdown(player, on_mk_shutdown_func, ctx);
  mk_player_play(player, url);

#if GST_PALY_VIDEO
  //gst_main();
  //sleep(3);
  main_h264();
  //main_play_yuv420sp();
#endif

  printf("enter any key to exit\n");
  getchar();

  if (player) {
      mk_player_release(player);
  }
  return 0;
}
#endif

/*-------------------------------------------
                  Main Functions
-------------------------------------------*/
int main(int argc, char** argv)
{
  int status = 0;
  int ret;

  if (argc != 4) {
    printf("Usage: %s <rknn_model> <video_path> <video_type 264/265> \n", argv[0]);
    return -1;
  }

  char* model_name = (char*)argv[1];
  char* video_name = argv[2];
  int video_type = atoi(argv[3]);

  rknn_app_context_t app_ctx;
  memset(&app_ctx, 0, sizeof(rknn_app_context_t));

  ret = init_model(model_name, &app_ctx);
  if (ret != 0) {
    printf("init model fail\n");
    return -1;
  }

  if (app_ctx.decoder == NULL) {
    MppDecoder* decoder = new MppDecoder();
    decoder->Init(video_type, 30, &app_ctx);
    decoder->SetCallback(mpp_decoder_frame_callback);
    app_ctx.decoder = decoder;
  }

  if (app_ctx.out_fp == NULL) {
    FILE* fp = fopen(OUT_VIDEO_PATH, "w");
    if(fp == NULL) {
        printf("open %s error\n", OUT_VIDEO_PATH);
        return -1;
    }
    app_ctx.out_fp = fp;
  }

  printf("app_ctx=%p decoder=%p\n", &app_ctx, app_ctx.decoder);

  if (strncmp(video_name, "rtsp", 4) == 0) {
#if defined(BUILD_VIDEO_RTSP)
        process_video_rtsp(&app_ctx, video_name);
#else
        printf("rtsp no support\n");
#endif
  } else {
    process_video_file(&app_ctx, video_name);
  }

  printf("waiting finish\n");
  usleep(3*1000*1000);

  // release
  fflush(app_ctx.out_fp);
  fclose(app_ctx.out_fp);

  if (app_ctx.decoder != nullptr) {
    delete(app_ctx.decoder);
    app_ctx.decoder = nullptr;
  }
  if (app_ctx.encoder != nullptr) {
    delete(app_ctx.encoder);
    app_ctx.encoder = nullptr;
  }

  release_model(&app_ctx);

  return 0;
}





#include <gst/gst.h>
#include <gst/app/gstappsrc.h>
#include <string.h>
#include <unistd.h>  // 包含 sleep 函数

#define FRAMERATE 25

// 模拟的 H.264 数据生成函数
// void fill_h264_data(uint8_t *data, size_t *size) {
//     // 在此处用实际的 H.264 数据填充这个缓冲区
//     //memset(data, 0, *size); // 仅填充为零（示例）


//   struct frame_yuv420sp frame;

//   printf("myFrameQueue.size=%d \r\n", myFrameQueue.size());
  
//      // 输出队列中的字节数组
//     if (!myFrameQueue.empty()) {
//         struct frame_yuv420sp frame = myFrameQueue.front();
//         if(*size >= frame.size){
//           *size = frame.size;
//         }
//         memcpy(data, frame.frameP, *size); //frame.size

//         //free(frame.frameP);
//         std::cout << "myFrameQueue pop size:"<<*size<<"\r\n";
//         std::cout << "myFrameQueue pop frame.size:"<<frame.size<<"\r\n";

//         myFrameQueue.pop(); // 出队appsrc
//     }else{
//       printf("myFrameQueue.empty \r\n");
//       usleep(1*1000);
//       *size = 0;
//     }
// }

#define g_printerr printf

void printfHex(char *buf, int len){
  int i=0;
  for(i=0; i<len; i++){
    printf("%02x ", buf[i]);
  }
  printf("\r\n");
}

static GstPadProbeReturn probe_callback(GstPad *pad, GstPadProbeInfo *info, gpointer user_data) {
    // 检查是否有缓冲区
    //if (info->type & GST_PAD_PROBE_INFO_BUFFER) 
    {
        GstBuffer *buffer = GST_PAD_PROBE_INFO_BUFFER(info);
        g_print("Received buffer of size: %u bytes\n", gst_buffer_get_size(buffer));


        //printfHex();
        // 你可以在这里添加更多的处理逻辑，例如分析数据内容

        return GST_PAD_PROBE_PASS;  // 继续传递数据
    }
    return GST_PAD_PROBE_PASS;  // 继续传递其他类型的数据
}

static void enough_data_callback(GstAppSrc *appsrc, gpointer user_data) {
    g_print("Buffering is enough, you can push more data now.\n");
}


size_t h264_size = 400*1024; // 你需要用实际 H.264 数据的大小替换
uint8_t *h264_data = NULL; //(uint8_t *)g_malloc(h264_size);
guint64 m_timestamp = 0;

static void need_data_callback(GstAppSrc *appsrc, guint size, gpointer user_data) {
    g_print("Need data callback triggered. Need %u bytes of data.\n", size);
    // 在这里可以根据需要推送数据

     // 检查是否还有数据可以推送
    struct frame_yuv420sp frame;

    while(1){
        // 输出队列中的字节数组
        printf("myFrameQueue.size=%d \r\n", myFrameQueue.size());
        if (!myFrameQueue.empty()) {
            frame = myFrameQueue.front();
            h264_size = frame.size;
            h264_data = (uint8_t *)frame.frameP;
            
            //std::cout << "myFrameQueue pop  h264_size:"<<h264_size<<"\r\n";
            std::cout << "myFrameQueue pop frame.size:"<<frame.size<<"\r\n";

            break;
        }else{
          usleep(2*1000);
        }
    }
    printf("h264_size=%d\r\n", h264_size);
    // 创建新的缓冲区
    //GstBuffer *gstBuffer = gst_buffer_new_and_alloc(h264_size);
    GstBuffer *gstBuffer = gst_buffer_new_and_alloc(h264_size);
    gst_buffer_fill(gstBuffer, 0, h264_data, h264_size);

    // 复制数据到缓冲区
    //gst_buffer_fill(gstBuffer, 0, h264_data, h264_size);

    // 设置 PTS 和持续时间
    //GST_BUFFER_PTS(gstBuffer) = gst_util_uint64_scale(gst_clock_get_time(gst_system_clock_obtain()), 1, GST_SECOND); // 1秒的时间戳
    //GST_BUFFER_DURATION(gstBuffer) = gst_util_uint64_scale(1, GST_SECOND, FRAMERATE); // 30 FPS
    // GST_BUFFER_PTS(gstBuffer) = gst_util_uint64_scale(1, GST_SECOND, FRAMERATE); // 30 FPS
    // GST_BUFFER_DURATION(gstBuffer) = gst_util_uint64_scale(1, GST_SECOND, FRAMERATE); // 30 FPS
    printf("frame.pts=%lld\r\n", frame.pts);
    GST_BUFFER_PTS (gstBuffer) = m_timestamp; //frame.pts;
    GST_BUFFER_DURATION (gstBuffer) = gst_util_uint64_scale_int (1, GST_SECOND, FRAMERATE);
    //m_timestamp += GST_BUFFER_DURATION (gstBuffer) ;

    //gst_clock_get_time(gst_system_clock_obtain());
    m_timestamp += frame.pts; //GST_SECOND / FRAMERATE; // 假设帧率为 20 fps



    //printf("g_signal_emit_by_name 111\r\n");
    GstFlowReturn ret;
    // 将缓冲区推送到 appsrc
    g_signal_emit_by_name(appsrc, "push-buffer", gstBuffer, &ret);
    gst_buffer_unref(gstBuffer);


    free(frame.frameP);
    myFrameQueue.pop(); // 出队appsrc
    printf("g_signal_emit_by_name ret=%d\r\n", ret);

}

#define WIDTH 2304 //2304
#define HEIGHT 1080

int main_h264() 
{
  int argc=0;
  char **argv;

    GstElement *pipeline, *appsrc, *decoder, *sink, *parser;
    GstBus *bus;
    GstMessage *msg;

    // 初始化 GStreamer
    gst_init(NULL, NULL);

    // 创建 GStreamer 元素
    appsrc = gst_element_factory_make("appsrc", "source");
    parser = gst_element_factory_make("h264parse", "parser");
    decoder = gst_element_factory_make("mppvideodec", "decoder");
    GstElement *videoscale = gst_element_factory_make("videoscale", "videoscale"); // 视频缩放

    GstElement *capsfilter = gst_element_factory_make("capsfilter", "capsfilter");
    GstElement *videoconvert = gst_element_factory_make("videoconvert", "convert");
    sink = gst_element_factory_make("xvimagesink", "sink");

    if (!appsrc || !parser || !decoder || !sink || !videoconvert || !videoscale || !capsfilter) {
        g_printerr("Not all elements could be created.\n");
        return -1;
    }
#if USE_H264
    GstCaps *caps = gst_caps_new_simple("video/x-h264",
                                         "framerate", GST_TYPE_FRACTION, FRAMERATE, 1, // 设置帧率为 20 fps
                                         NULL);
    g_object_set(appsrc, "caps", caps, NULL);
    gst_caps_unref(caps);
#else

    // 设置 appsrc 属性
    g_object_set(appsrc, "caps", gst_caps_new_simple("video/x-raw",
        "framerate", GST_TYPE_FRACTION, FRAMERATE, 1,
        "format", G_TYPE_STRING, "I420", // YUV 420P 格式
        "width", G_TYPE_INT, WIDTH,
        "height", G_TYPE_INT, HEIGHT,
        NULL), NULL);
#endif

    // 设置视频缩放的目标大小
    //g_object_set(videoscale, "add-borders", TRUE, nullptr);
    //g_object_set(videoscale, "scale", 0.5, nullptr); // 将视频缩放到原始大小的 50%
    // 设置缩放到指定的窗口大小
    //g_object_set(capsfilter, "caps", gst_caps_from_string("video/x-raw,width=640,height=480"), nullptr); // 设置窗口大小

    // 创建管道
    pipeline = gst_pipeline_new("video-player");
    if (!pipeline) {
        g_printerr("Pipeline could not be created.\n");
        return -1;
    }

    // 设置 ximagesink 的窗口大小
    //g_object_set(sink, "width", 640, "height", 480, nullptr); // 设置窗口大小为 640x480
    g_object_set(sink, "name", "MyVideoWindow", nullptr);
    
#if USE_H264

// 将元素添加到管道
    gst_bin_add_many(GST_BIN(pipeline), appsrc, parser, decoder,   videoconvert, sink, NULL); //paser,

    // 链接元素
    if (!gst_element_link_many(appsrc, parser, decoder,   videoconvert, sink, NULL)) { //paser, 
        g_printerr("Elements could not be linked.\n");
        gst_object_unref(pipeline);
        return -1;
    }
#else
    
    gst_bin_add_many(GST_BIN(pipeline), appsrc,  videoconvert, sink, NULL); //paser,

    // 链接元素
    if (!gst_element_link_many(appsrc, videoconvert, sink, NULL)) { //paser, 
        g_printerr("Elements could not be linked.\n");
        gst_object_unref(pipeline);
        return -1;
    }
#endif

    // 连接 enough-data 回调
    g_signal_connect(appsrc, "enough-data", G_CALLBACK(enough_data_callback), nullptr);

    // 连接 need-data 回调
    g_signal_connect(appsrc, "need-data", G_CALLBACK(need_data_callback), nullptr);

    // 添加探针到 h264parse 的输出 pad
    // GstPad *pad = gst_element_get_static_pad(decoder, "src");
    // gst_pad_add_probe(pad, GST_PAD_PROBE_TYPE_BUFFER, probe_callback, nullptr, nullptr);
    // gst_object_unref(pad); // 释放 pad 的引用

    // 启动管道
    gst_element_set_state(pipeline, GST_STATE_PLAYING);

    printf("GST_STATE_PLAYING---\r\n");

    // 模拟 H.264 数据生成
    //size_t h264_size = 400*1024; // 你需要用实际 H.264 数据的大小替换
    //uint8_t *h264_data = (uint8_t *)g_malloc(h264_size);

    while (1) { // 无限循环以持续播放
#if 1
#if 0
        h264_size = 400*1024;
        fill_h264_data(h264_data, &h264_size);
        if(h264_size==0){
          usleep(1000000 / FRAMERATE); // 控制为指定帧率
          continue;
        }
        printf("h264_size=%d\r\n", h264_size);
        // 创建新的缓冲区
        GstBuffer *gstBuffer = gst_buffer_new_and_alloc(h264_size);
        //memcpy(GST_BUFFER_DATA(buffer), h264_data, h264_size);
        //memcpy(GST_BUFFER_DATA(buffer), h264_data, h264_size);

              // retrieve
      //GstMapInfo map; 

      //gst_buffer_fill(gstBuffer, 0, h264_data, h264_size);

      // GstMapInfo mapInfo;
      // if (!gst_buffer_map(gstBuffer, &mapInfo, GST_MAP_WRITE)) {
      //     printf("Could not map buffer---\r\n");
      //     continue;
      // }
      // memcpy(mapInfo.data, h264_data, mapInfo.size);
      // gst_buffer_unmap(gstBuffer, &mapInfo);

      //   // 设置缓冲区的时间戳和持续时间
      //   GST_BUFFER_PTS(gstBuffer) = gst_util_get_timestamp(); // 当前时间戳
      //   GST_BUFFER_DURATION(gstBuffer) = GST_SECOND / FRAMERATE;


    // 复制数据到缓冲区
    gst_buffer_fill(gstBuffer, 0, h264_data, h264_size);

     // 设置 PTS 和持续时间
    GST_BUFFER_PTS(gstBuffer) = gst_util_uint64_scale(gst_clock_get_time(gst_system_clock_obtain()), 1, GST_SECOND); // 1秒的时间戳
    GST_BUFFER_DURATION(gstBuffer) = gst_util_uint64_scale(1, GST_SECOND, 30); // 30 FPS


         //GST_BUFFER_PTS(gstBuffer) = gst_util_uint64_scale(1, GST_SECOND, 25); // gst_util_get_timestamp(); // 当前时间戳
         //GST_BUFFER_DURATION(gstBuffer) = gst_util_uint64_scale(1, GST_SECOND, 25); //GST_SECOND / FRAMERATE;

    // 设置 PTS 和持续时间
    // GST_BUFFER_PTS(gstBuffer) = gst_util_uint64_scale(1, GST_SECOND, 30); // 30 FPS
    // GST_BUFFER_DURATION(gstBuffer) = gst_util_uint64_scale(1, GST_SECOND, 30); // 30 FPS

        printf("g_signal_emit_by_name 111\r\n");
        // 将缓冲区推送到 appsrc
        g_signal_emit_by_name(appsrc, "push-buffer", gstBuffer, NULL);
        gst_buffer_unref(gstBuffer);
        printf("g_signal_emit_by_name 222\r\n");
#endif
        //usleep(1000000 / FRAMERATE); // 控制为指定帧率
        g_usleep(33000); // 每帧大约 33 ms，约 30 FPS
#else

    static gboolean white = FALSE;
    static GstClockTime timestamp = 0;

    const guint size = 800 * 600 * 4;
    GstBuffer *buffer = ::gst_buffer_new_allocate(nullptr, size, nullptr);

    // This makes the image black/white.
    ::gst_buffer_memset(buffer, 0, white ? 0xff : 0x0, size);

    white = !white;

    GST_BUFFER_PTS(buffer) = timestamp;
    GST_BUFFER_DURATION(buffer) = ::gst_util_uint64_scale_int (1, GST_SECOND, 20);

    timestamp += GST_BUFFER_DURATION(buffer);

    GstFlowReturn ret;
    ::g_signal_emit_by_name(appsrc, "push-buffer", buffer, &ret);

    ::gst_buffer_unref(buffer);
        // 睡眠以控制帧率
        usleep(1000000 / FRAMERATE); // 控制为指定帧率
#endif        
      usleep(1000000 / FRAMERATE); // 控制为指定帧率
    }

    // 发送 EOS（结束流）
    g_signal_emit_by_name(appsrc, "end-of-stream", NULL);

    // 等待播放完成
    bus = gst_element_get_bus(pipeline);
    msg = gst_bus_timed_pop_filtered(bus, GST_CLOCK_TIME_NONE,
                                      (GstMessageType)(GST_MESSAGE_ERROR | GST_MESSAGE_EOS));

    // 处理消息
    if (msg != NULL) {
        GError *err;
        gchar *debug_info;

        switch (GST_MESSAGE_TYPE(msg)) {
            case GST_MESSAGE_ERROR:
                gst_message_parse_error(msg, &err, &debug_info);
                g_printerr("Error received from element %s: %s\n",
                            GST_OBJECT_NAME(msg->src), err->message);
                g_printerr("Debugging information: %s\n", debug_info ? debug_info : "none");
                g_clear_error(&err);
                g_free(debug_info);
                break;
            case GST_MESSAGE_EOS:
                g_print("End-Of-Stream reached.\n");
                break;
            default:
                g_printerr("Unexpected message received.\n");
                break;
        }
        gst_message_unref(msg);
    }

    // 清理
    g_free(h264_data);
    gst_object_unref(bus);
    gst_element_set_state(pipeline, GST_STATE_NULL);
    gst_object_unref(pipeline);

    return 0;
}

#if 0
#include <gst/gst.h>

#include <gst/video/video-format.h>
#include <gst/app/gstappsrc.h>
#include <string.h>

#define WIDTH 1920
#define HEIGHT 1080
#define FRAMERATE 30

// 模拟的 YUV 420 SP 数据生成函数
void fill_yuv420sp_data(uint8_t *data, size_t size) {
    // 这里你可以用实际的 YUV 数据填充这个缓冲区
    //memset(data, 128, size); // 填充为中间灰色
#if 0
    memset(buffer, 128, size); // 这只是一个示例，实际数据应来自你的YUV420SP数据源
#else

  struct frame_yuv420sp frame;
     // 输出队列中的字节数组
    if (!myFrameQueue.empty()) {
        struct frame_yuv420sp frame = myFrameQueue.front();

        memcpy(data, frame.frameP, size); //frame.size

        //free(frame.frameP);
        std::cout << "myFrameQueue pop size:"<<size;
        std::cout << "myFrameQueue pop frame.size:"<<frame.size;

        myFrameQueue.pop(); // 出队appsrc
    }else{
      printf("myFrameQueue.empty \r\n");
      usleep(100*1000);
    }
#endif    
}

int main_play_yuv420sp() 
{

    int argc=0;
    char **argv;
    GstElement *pipeline, *appsrc, *parser, *sink;
    GstBus *bus;
    GstMessage *msg;

    // 初始化 GStreamer
    gst_init(&argc, &argv);

    // 创建 GStreamer 元素
    appsrc = gst_element_factory_make("appsrc", "source");
    parser = gst_element_factory_make("videoparse", "parser");
    sink = gst_element_factory_make("autovideosink", "sink");

    if (!appsrc || !parser || !sink) {
        g_printerr("Not all elements could be created.\n");
        return -1;
    }

    // 设置 appsrc 属性
    g_object_set(appsrc, "caps", gst_caps_new_simple("video/x-raw",
        "format", G_TYPE_STRING, "NV12",
        "width", G_TYPE_INT, WIDTH,
        "height", G_TYPE_INT, HEIGHT,
        "framerate", GST_TYPE_FRACTION, FRAMERATE, 1,
        NULL), NULL);
    g_object_set(appsrc, "stream-type", 0, NULL); // 0: live stream

    // 创建管道
    pipeline = gst_pipeline_new("video-player");
    if (!pipeline) {
        g_printerr("Pipeline could not be created.\n");
        return -1;
    }

    // 将元素添加到管道
    gst_bin_add_many(GST_BIN(pipeline), appsrc, parser, sink, NULL);

    // 链接元素
    if (!gst_element_link_many(appsrc, parser, sink, NULL)) {
        g_printerr("Elements could not be linked.\n");
        gst_object_unref(pipeline);
        return -1;
    }

    // 启动管道
    gst_element_set_state(pipeline, GST_STATE_PLAYING);

    // 生成 YUV 420 SP 数据并将其推送到 appsrc
    size_t yuv_size = WIDTH * HEIGHT * 3 / 2; // YUV 420 SP 格式的大小
    uint8_t *yuv_data = (uint8_t*)g_malloc(yuv_size);

    for (int i = 0; i < FRAMERATE * 100; ++i) { // 播放 10 秒
        fill_yuv420sp_data(yuv_data, yuv_size);

        // 创建新的缓冲区
        GstBuffer *buffer = gst_buffer_new_and_alloc(yuv_size);
        memcpy((buffer), yuv_data, yuv_size);

        // 设置缓冲区的时间戳和持续时间
        GST_BUFFER_PTS(buffer) = i * GST_SECOND / FRAMERATE;
        GST_BUFFER_DURATION(buffer) = GST_SECOND / FRAMERATE;

        // 将缓冲区推送到 appsrc
        g_signal_emit_by_name(appsrc, "push-buffer", buffer, NULL);
        gst_buffer_unref(buffer);
    }

    // 发送 EOS（结束流）
    g_signal_emit_by_name(appsrc, "end-of-stream", NULL);

    // 等待播放完成
    bus = gst_element_get_bus(pipeline);
    msg = gst_bus_timed_pop_filtered(bus, GST_CLOCK_TIME_NONE,
                                      (GstMessageType)(GST_MESSAGE_ERROR | GST_MESSAGE_EOS));

    // 处理消息
    if (msg != NULL) {
        GError *err;
        gchar *debug_info;

        switch (GST_MESSAGE_TYPE(msg)) {
            case GST_MESSAGE_ERROR:
                gst_message_parse_error(msg, &err, &debug_info);
                g_printerr("Error received from element %s: %s\n",
                            GST_OBJECT_NAME(msg->src), err->message);
                g_printerr("Debugging information: %s\n", debug_info ? debug_info : "none");
                g_clear_error(&err);
                g_free(debug_info);
                break;
            case GST_MESSAGE_EOS:
                g_print("End-Of-Stream reached.\n");
                break;
            default:
                g_printerr("Unexpected message received.\n");
                break;
        }
        gst_message_unref(msg);
    }

    // 清理
    g_free(yuv_data);
    gst_object_unref(bus);
    gst_element_set_state(pipeline, GST_STATE_NULL);
    gst_object_unref(pipeline);

    return 0;
}
#endif

#if 0

#include <gst/gst.h>
#include <gst/video/video-format.h>
#include <gst/app/gstappsrc.h>
#include <string.h>

#define WIDTH 1920
#define HEIGHT 1080
#define FRAMERATE 30

// 模拟的 YUV 数据生成函数
void fill_yuv_data(uint8_t *data, size_t size) 
{
    // 这里你可以用实际的 YUV 数据填充这个缓冲区
    memset(data, 128, size); // 填充为中间灰色
}

int main_play_yuv() 
{
    int argc=0;
    char **argv;
    GstElement *pipeline, *appsrc, *parser, *sink;
    GstBus *bus;
    GstMessage *msg;

    // 初始化 GStreamer
    gst_init(&argc, &argv);

    // 创建 GStreamer 元素
    appsrc = gst_element_factory_make("appsrc", "source");
    parser = gst_element_factory_make("videoparse", "parser");
    sink = gst_element_factory_make("autovideosink", "sink");

    if (!appsrc || !parser || !sink) {
        g_printerr("Not all elements could be created.\n");
        return -1;
    }

    // 设置 appsrc 属性
    g_object_set(appsrc, "caps", gst_caps_new_simple("video/x-raw",
        "format", G_TYPE_STRING, "I420",
        "width", G_TYPE_INT, WIDTH,
        "height", G_TYPE_INT, HEIGHT,
        "framerate", GST_TYPE_FRACTION, FRAMERATE, 1,
        NULL), NULL);
    g_object_set(appsrc, "stream-type", 0, NULL); // 0: live stream

    // 设置视频解析器参数
    g_object_set(parser, "format", GST_VIDEO_FORMAT_I420, NULL);

    // 创建管道
    pipeline = gst_pipeline_new("video-player");
    if (!pipeline) {
        g_printerr("Pipeline could not be created.\n");
        return -1;
    }

    // 将元素添加到管道
    gst_bin_add_many(GST_BIN(pipeline), appsrc, parser, sink, NULL);

    // 链接元素
    if (!gst_element_link_many(appsrc, parser, sink, NULL)) {
        g_printerr("Elements could not be linked.\n");
        gst_object_unref(pipeline);
        return -1;
    }

    // 启动管道
    gst_element_set_state(pipeline, GST_STATE_PLAYING);

    // 生成 YUV 数据并将其推送到 appsrc
    size_t yuv_size = WIDTH * HEIGHT * 3 / 2; // YUV 420 格式的大小
    uint8_t *yuv_data = (uint8_t *)g_malloc(yuv_size);

    for (int i = 0; i < FRAMERATE * 10; ++i) { // 播放 10 秒
        fill_yuv_data(yuv_data, yuv_size);

        // 创建新的缓冲区
        GstBuffer *buffer = gst_buffer_new_and_alloc(yuv_size);
        memcpy(buffer, yuv_data, yuv_size);

        // 设置缓冲区的时间戳和持续时间
        GST_BUFFER_PTS(buffer) = i * GST_SECOND / FRAMERATE;
        GST_BUFFER_DURATION(buffer) = GST_SECOND / FRAMERATE;

        // 将缓冲区推送到 appsrc
        g_signal_emit_by_name(appsrc, "push-buffer", buffer, NULL);
        gst_buffer_unref(buffer);
    }

    // 发送 EOS（结束流）
    g_signal_emit_by_name(appsrc, "end-of-stream", NULL);

    // 等待播放完成
    bus = gst_element_get_bus(pipeline);
    msg = gst_bus_timed_pop_filtered(bus, GST_CLOCK_TIME_NONE,
                                      (GstMessageType)(GST_MESSAGE_ERROR | GST_MESSAGE_EOS));

    // 处理消息
    if (msg != NULL) {
        GError *err;
        gchar *debug_info;

        switch (GST_MESSAGE_TYPE(msg)) {
            case GST_MESSAGE_ERROR:
                gst_message_parse_error(msg, &err, &debug_info);
                g_printerr("Error received from element %s: %s\n",
                            GST_OBJECT_NAME(msg->src), err->message);
                g_printerr("Debugging information: %s\n", debug_info ? debug_info : "none");
                g_clear_error(&err);
                g_free(debug_info);
                break;
            case GST_MESSAGE_EOS:
                g_print("End-Of-Stream reached.\n");
                break;
            default:
                g_printerr("Unexpected message received.\n");
                break;
        }
        gst_message_unref(msg);
    }

    // 清理
    g_free(yuv_data);
    gst_object_unref(bus);
    gst_element_set_state(pipeline, GST_STATE_NULL);
    gst_object_unref(pipeline);

    return 0;
}
#endif



#if 0


// 模拟从内存中读取YUV420SP数据
void fill_buffer_with_yuv420sp_data(guint8 *buffer, guint size) {
    // 在这里填充你的YUV420SP数据
    // 例如：memcpy(buffer, your_yuv420sp_data, size);
    // 这里我们模拟填充一些数据
#if 0
    memset(buffer, 128, size); // 这只是一个示例，实际数据应来自你的YUV420SP数据源
#else

  struct frame_yuv420sp frame;

     // 输出队列中的字节数组
    if (!myFrameQueue.empty()) {
        struct frame_yuv420sp frame = myFrameQueue.front();

        memcpy(buffer, frame.frameP, size);

        free(frame.frameP);
        
        std::cout << "myFrameQueue="<<size<<"\r\n";
        std::cout << "myFrameQueue="<<frame.size<<"\r\n";

        myFrameQueue.pop(); // 出队
    }else{
      usleep(10*1000);
    }
#endif
}

static void start_feed(GstElement *source, guint size, gpointer user_data) {
    GstBuffer *buffer;
    GstFlowReturn ret;
    guint8 *data;

    // 分配缓冲区
    buffer = gst_buffer_new_allocate(NULL, size, NULL);
    if (!buffer) {
        g_printerr("Failed to allocate buffer\n");
        return;
    }

    // 获取缓冲区数据指针
    GstMapInfo map;
    gst_buffer_map(buffer, &map, GST_MAP_WRITE);
    data = map.data;

    // 填充缓冲区数据
    fill_buffer_with_yuv420sp_data(data, size);

    gst_buffer_unmap(buffer, &map);

    // 推送缓冲区数据到appsrc
    g_signal_emit_by_name(source, "push-buffer", buffer, &ret);

    if (ret != GST_FLOW_OK) {
        g_printerr("Failed to push buffer to appsrc\n");
    }

    // 释放缓冲区
    gst_buffer_unref(buffer);
}

int gst_main() 
{
    GstElement *pipeline, *source, *capsfilter, *sink;
    GstCaps *caps;
    GstBus *bus;
    GstMessage *msg;
    int argc=0;
    char **argv;

    // 初始化GStreamer
    gst_init(&argc, &argv);
    //gst_init(0, 0);

    // 创建GStreamer元素
    pipeline = gst_pipeline_new("yuv420sp-pipeline");
    source = gst_element_factory_make("appsrc", "source");
    capsfilter = gst_element_factory_make("capsfilter", "capsfilter");
    sink = gst_element_factory_make("autovideosink", "sink");

    if (!pipeline || !source || !capsfilter || !sink) {
        g_printerr("Not all elements could be created.\n");
        return -1;
    }

    // 设置capsfilter的属性
    caps = gst_caps_new_simple("video/x-raw",
                               "format", G_TYPE_STRING, "NV12",
                               "width", G_TYPE_INT, 1920,  // 设置你的视频宽度
                               "height", G_TYPE_INT, 1080, // 设置你的视频高度
                               "framerate", GST_TYPE_FRACTION, 30, 1, // 设置你的帧率
                               NULL);
    g_object_set(capsfilter, "caps", caps);
    gst_caps_unref(caps);

    // 配置appsrc
    g_object_set(source, "caps", caps, "format", GST_FORMAT_TIME, NULL);
    g_signal_connect(source, "need-data", G_CALLBACK(start_feed), NULL);

    // 将元素添加到管道中
    gst_bin_add_many(GST_BIN(pipeline), source, capsfilter, sink, NULL);

    // 链接元素
    if (!gst_element_link_many(source, capsfilter, sink, NULL)) {
        g_printerr("Elements could not be linked.\n");
        gst_object_unref(pipeline);
        return -1;
    }

    // 启动管道
    gst_element_set_state(pipeline, GST_STATE_PLAYING);

    // 等待消息
    bus = gst_element_get_bus(pipeline);
    msg = gst_bus_timed_pop_filtered(bus, GST_CLOCK_TIME_NONE, (GstMessageType)(GST_MESSAGE_ERROR | GST_MESSAGE_EOS));

    // 处理消息
    if (msg != NULL) {
        GError *err;
        gchar *debug_info;

        switch (GST_MESSAGE_TYPE(msg)) {
            case GST_MESSAGE_ERROR:
                gst_message_parse_error(msg, &err, &debug_info);
                g_printerr("Error received from element %s: %s\n", GST_OBJECT_NAME(msg->src), err->message);
                g_printerr("Debugging information: %s\n", debug_info ? debug_info : "none");
                g_clear_error(&err);
                g_free(debug_info);
                break;
            case GST_MESSAGE_EOS:
                g_print("End-Of-Stream reached.\n");
                break;
            default:
                // We should not reach here because we only asked for ERRORs and EOS
                g_printerr("Unexpected message received.\n");
                break;
        }
        gst_message_unref(msg);
    }

    // 释放资源
    gst_object_unref(bus);
    gst_element_set_state(pipeline, GST_STATE_NULL);
    gst_object_unref(pipeline);

    printf("main return 0");

    return 0;
}


#endif