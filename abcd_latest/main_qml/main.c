/* USER CODE BEGIN Header */
/**
  ******************************************************************************
  * @file           : main.c
  * @brief          : CAN Polling Receive + GPIO Control + CAN Transmit + A25 UART Sensor
  ******************************************************************************
  */
/* USER CODE END Header */

#include "main.h"

/* Private variables ---------------------------------------------------------*/
CAN_HandleTypeDef hcan1;

/* USER CODE BEGIN PV */

CAN_RxHeaderTypeDef RxHeader;
CAN_TxHeaderTypeDef TxHeader;

uint8_t RxData[8];
uint8_t TxData[8];

uint32_t TxMailbox;

uint32_t duration = 0;
uint16_t distance_cm = 0;
uint32_t distance_sum = 0;

uint32_t lastDistanceSendTime = 0;
uint32_t lastPa0SendTime = 0;

/*
  A25 Sensor UART:
  PA9  = USART1_TX
  PA10 = USART1_RX

  Sensor TX -> PA10
  Sensor RX -> PA9
  Sensor GND -> STM32 GND

  This code does NOT use HAL UART driver.
  It uses direct USART1 register method.
  So stm32f4xx_hal_uart.h / stm32f4xx_hal_uart.c is NOT required.

  A25 raw 8 bytes will be sent on CAN ID 0x203.
*/

/*
  Direct STM32 pin mapping from machine pin sheet:

  0x01 = Suction Relay          = PA7
  0x02 = Jet Spray              = PC5
  0x03 = Brush Spray            = PB1
  0x04 = Dump Up                = PE8
  0x05 = Dump Down              = PE10
  0x06 = Gate Open              = PE12
  0x07 = Gate Close             = PE14
  0x08 = Left Brush Extend      = PB10
  0x09 = Left Brush Retract     = PA6
  0x0A = Right Brush Extend     = PC4
  0x0B = Right Brush Retract    = PB0
  0x0C = Rear Brush Up          = PE7
  0x0D = Rear Brush Down        = PE9
  0x0E = Front Left Brush Up    = PE11
  0x0F = Front Left Brush Down  = PE13
  0x10 = Litter Picker Mode     = PE15
  0x11 = Sweeping Mode          = PE3
  0x12 = Filter Cleaning Open   = PE5
  0x13 = Filter Cleaning Close  = PC13
  0x14 = Filter Cleaning Motor  = PC1
  0x15 = Suction Analog Control = PA5 DAC_OUT2
  0x16 = Emergency Input        = PC3
  0x17 = Front Right Brush Up   = PE2
  0x18 = Front Right Brush Down = PE4
  0x19 = Front Left Brush Motor = PE6
  0x1A = Front Right Brush Motor= PC0
  0x1B = Rear Brush Motor       = PC2
*/

uint32_t frontDownStartTime = 0;
uint8_t frontDownDelayActive = 0;

uint8_t frontUpSequenceActive = 0;
uint32_t frontUpSequenceStartTime = 0;

uint8_t gpioStates[28];

const uint8_t allCommands[] = {
    0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08, 0x09, 0x0A,
    0x0B, 0x0C, 0x0D, 0x0E, 0x0F, 0x10, 0x11, 0x12, 0x13, 0x14,
    0x16, 0x17, 0x18, 0x19, 0x1A, 0x1B
};

const uint8_t totalCommands = sizeof(allCommands) / sizeof(allCommands[0]);

/* USER CODE END PV */

/* Private function prototypes -----------------------------------------------*/
void SystemClock_Config(void);
static void MX_GPIO_Init(void);
static void MX_CAN1_Init(void);
static void MX_DAC_PA5_Init(void);
static void MX_USART1_Register_Init(void);
static void MX_ADC1_PA0_Register_Init(void);

/* USER CODE BEGIN PFP */

uint32_t Read_Distance(void);

void CAN_Filter_Config(void);
uint8_t CAN_Send_Safe(CAN_TxHeaderTypeDef *header, uint8_t *data);
void CAN_Send_Distance(uint16_t distance);
void CAN_Send_GPIO_Status(uint8_t cmd, uint8_t state);
void CAN_Send_A25_Data(uint8_t *data, uint8_t len);

void CAN_Process_Command(uint8_t cmd, uint8_t state);
void CAN_Poll_Receive(void);
void CAN_RecoverFromBusOff(void);

uint8_t Get_GPIO_State(uint8_t cmd);

void Process_Front_Up_Sequence(void);
void Set_Suction_DAC(uint16_t dacValue);

static uint8_t USART1_ReadByte(uint8_t *data);
void Read_A25_Sensor(void);

/* USER CODE END PFP */

/* USER CODE BEGIN 0 */

uint32_t Read_Distance(void)
{
    uint32_t count = 0;
    uint32_t timeout = 30000;

    HAL_GPIO_WritePin(GPIOA, GPIO_PIN_0, GPIO_PIN_RESET);
    for(volatile int i = 0; i < 50; i++);

    HAL_GPIO_WritePin(GPIOA, GPIO_PIN_0, GPIO_PIN_SET);
    for(volatile int i = 0; i < 150; i++);

    HAL_GPIO_WritePin(GPIOA, GPIO_PIN_0, GPIO_PIN_RESET);

    timeout = 30000;
    while(HAL_GPIO_ReadPin(GPIOA, GPIO_PIN_1) == GPIO_PIN_RESET)
    {
        if(timeout-- == 0)
        {
            return 0;
        }
    }

    timeout = 30000;
    while(HAL_GPIO_ReadPin(GPIOA, GPIO_PIN_1) == GPIO_PIN_SET)
    {
        count++;

        for(volatile int i = 0; i < 10; i++);

        if(timeout-- == 0)
        {
            break;
        }
    }

    return count;
}

void CAN_Process_Command(uint8_t cmd, uint8_t state)
{
    GPIO_PinState pinState;
    uint8_t valid_cmd = 1;

    // 0x15 is suction analog control on PA5 DAC_OUT2
    if(cmd == 0x15)
    {
        uint8_t speedPercent = state;

        if(speedPercent > 100)
        {
            speedPercent = 100;
        }

        uint16_t dacValue = (speedPercent * 4095) / 100;
        Set_Suction_DAC(dacValue);
        CAN_Send_GPIO_Status(0x15, speedPercent);
        return;
    }

    // Emergency is input only
    if(cmd == 0x16)
    {
        CAN_Send_GPIO_Status(0x16, Get_GPIO_State(0x16));
        return;
    }

    pinState = state ? GPIO_PIN_SET : GPIO_PIN_RESET;

    uint8_t is_extend_retract = (cmd == 0x08 || cmd == 0x09 || cmd == 0x0A || cmd == 0x0B);
    uint8_t is_litter = (cmd == 0x10);
    uint8_t is_sweeping = (cmd == 0x11);

    /*
      Front Left Brush Up sequence:
      - Start LB/RB retract for 10 seconds.
      - After 10 seconds, stop retract and turn Front Left Brush Up ON.
    */
    if(cmd == 0x0E && state == 1)
    {
        frontUpSequenceActive = 1;
        frontUpSequenceStartTime = HAL_GetTick();

        frontDownStartTime = 0;
        frontDownDelayActive = 0;

        HAL_GPIO_WritePin(GPIOE, GPIO_PIN_11, GPIO_PIN_RESET); // FL Up
        HAL_GPIO_WritePin(GPIOE, GPIO_PIN_13, GPIO_PIN_RESET); // FL Down

        HAL_GPIO_WritePin(GPIOB, GPIO_PIN_10, GPIO_PIN_RESET); // LB Extend
        HAL_GPIO_WritePin(GPIOC, GPIO_PIN_4, GPIO_PIN_RESET);  // RB Extend

        HAL_GPIO_WritePin(GPIOA, GPIO_PIN_6, GPIO_PIN_SET);    // LB Retract
        HAL_GPIO_WritePin(GPIOB, GPIO_PIN_0, GPIO_PIN_SET);    // RB Retract

        CAN_Send_GPIO_Status(0x0E, 0);
        CAN_Send_GPIO_Status(0x0F, 0);
        CAN_Send_GPIO_Status(0x08, 0);
        CAN_Send_GPIO_Status(0x0A, 0);
        CAN_Send_GPIO_Status(0x09, 1);
        CAN_Send_GPIO_Status(0x0B, 1);

        return;
    }

    if(cmd == 0x0E && state == 0)
    {
        frontUpSequenceActive = 0;

        HAL_GPIO_WritePin(GPIOE, GPIO_PIN_11, GPIO_PIN_RESET); // FL Up
        HAL_GPIO_WritePin(GPIOA, GPIO_PIN_6, GPIO_PIN_RESET);  // LB Retract
        HAL_GPIO_WritePin(GPIOB, GPIO_PIN_0, GPIO_PIN_RESET);  // RB Retract

        CAN_Send_GPIO_Status(0x0E, 0);
        CAN_Send_GPIO_Status(0x09, 0);
        CAN_Send_GPIO_Status(0x0B, 0);

        return;
    }

    /*
      Front Left Brush Down:
      - Stop extend/retract immediately.
      - Enable extend/retract only after 10 seconds.
    */
    if(cmd == 0x0F && state == 1)
    {
        frontUpSequenceActive = 0;

        frontDownStartTime = HAL_GetTick();
        frontDownDelayActive = 1;

        HAL_GPIO_WritePin(GPIOB, GPIO_PIN_10, GPIO_PIN_RESET); // LB Extend
        HAL_GPIO_WritePin(GPIOA, GPIO_PIN_6, GPIO_PIN_RESET);  // LB Retract
        HAL_GPIO_WritePin(GPIOC, GPIO_PIN_4, GPIO_PIN_RESET);  // RB Extend
        HAL_GPIO_WritePin(GPIOB, GPIO_PIN_0, GPIO_PIN_RESET);  // RB Retract

        CAN_Send_GPIO_Status(0x08, 0);
        CAN_Send_GPIO_Status(0x09, 0);
        CAN_Send_GPIO_Status(0x0A, 0);
        CAN_Send_GPIO_Status(0x0B, 0);
    }

    if(cmd == 0x0F && state == 0)
    {
        frontDownStartTime = 0;
        frontDownDelayActive = 0;

        HAL_GPIO_WritePin(GPIOB, GPIO_PIN_10, GPIO_PIN_RESET); // LB Extend
        HAL_GPIO_WritePin(GPIOA, GPIO_PIN_6, GPIO_PIN_RESET);  // LB Retract
        HAL_GPIO_WritePin(GPIOC, GPIO_PIN_4, GPIO_PIN_RESET);  // RB Extend
        HAL_GPIO_WritePin(GPIOB, GPIO_PIN_0, GPIO_PIN_RESET);  // RB Retract

        CAN_Send_GPIO_Status(0x08, 0);
        CAN_Send_GPIO_Status(0x09, 0);
        CAN_Send_GPIO_Status(0x0A, 0);
        CAN_Send_GPIO_Status(0x0B, 0);
    }

    if(state == 1 && is_extend_retract)
    {
        uint8_t frontDownState = Get_GPIO_State(0x0F);

        if(frontDownState == 0 ||
           frontDownDelayActive == 0 ||
           frontDownStartTime == 0 ||
           (HAL_GetTick() - frontDownStartTime < 10000))
        {
            HAL_GPIO_WritePin(GPIOB, GPIO_PIN_10, GPIO_PIN_RESET); // LB Extend
            HAL_GPIO_WritePin(GPIOA, GPIO_PIN_6, GPIO_PIN_RESET);  // LB Retract
            HAL_GPIO_WritePin(GPIOC, GPIO_PIN_4, GPIO_PIN_RESET);  // RB Extend
            HAL_GPIO_WritePin(GPIOB, GPIO_PIN_0, GPIO_PIN_RESET);  // RB Retract

            CAN_Send_GPIO_Status(0x08, 0);
            CAN_Send_GPIO_Status(0x09, 0);
            CAN_Send_GPIO_Status(0x0A, 0);
            CAN_Send_GPIO_Status(0x0B, 0);

            CAN_Send_GPIO_Status(cmd, 0);
            return;
        }
    }

    // Litter and Sweeping are mutual exclusive
    if(state)
    {
        if(is_litter)
        {
            HAL_GPIO_WritePin(GPIOE, GPIO_PIN_3, GPIO_PIN_RESET);  // Sweeping OFF
            CAN_Send_GPIO_Status(0x11, 0);
        }
        else if(is_sweeping)
        {
            HAL_GPIO_WritePin(GPIOE, GPIO_PIN_15, GPIO_PIN_RESET); // Litter OFF
            CAN_Send_GPIO_Status(0x10, 0);
        }
    }

    switch(cmd)
    {
        case 0x01:
            HAL_GPIO_WritePin(GPIOA, GPIO_PIN_7, pinState);  // Suction
            break;

        case 0x02:
            HAL_GPIO_WritePin(GPIOC, GPIO_PIN_5, pinState);  // Jet Spray
            break;

        case 0x03:
            HAL_GPIO_WritePin(GPIOB, GPIO_PIN_1, pinState);  // Brush Spray
            break;

        case 0x04:
            HAL_GPIO_WritePin(GPIOE, GPIO_PIN_10, GPIO_PIN_RESET); // Dump Down OFF
            HAL_GPIO_WritePin(GPIOE, GPIO_PIN_8, pinState);        // Dump Up
            break;

        case 0x05:
            HAL_GPIO_WritePin(GPIOE, GPIO_PIN_8, GPIO_PIN_RESET);  // Dump Up OFF
            HAL_GPIO_WritePin(GPIOE, GPIO_PIN_10, pinState);       // Dump Down
            break;

        case 0x06:
            HAL_GPIO_WritePin(GPIOE, GPIO_PIN_14, GPIO_PIN_RESET); // Gate Close OFF
            HAL_GPIO_WritePin(GPIOE, GPIO_PIN_12, pinState);       // Gate Open
            break;

        case 0x07:
            HAL_GPIO_WritePin(GPIOE, GPIO_PIN_12, GPIO_PIN_RESET); // Gate Open OFF
            HAL_GPIO_WritePin(GPIOE, GPIO_PIN_14, pinState);       // Gate Close
            break;

        case 0x08:
            HAL_GPIO_WritePin(GPIOA, GPIO_PIN_6, GPIO_PIN_RESET);  // LB Retract OFF
            HAL_GPIO_WritePin(GPIOB, GPIO_PIN_10, pinState);       // LB Extend
            break;

        case 0x09:
            HAL_GPIO_WritePin(GPIOB, GPIO_PIN_10, GPIO_PIN_RESET); // LB Extend OFF
            HAL_GPIO_WritePin(GPIOA, GPIO_PIN_6, pinState);        // LB Retract
            break;

        case 0x0A:
            HAL_GPIO_WritePin(GPIOB, GPIO_PIN_0, GPIO_PIN_RESET);  // RB Retract OFF
            HAL_GPIO_WritePin(GPIOC, GPIO_PIN_4, pinState);        // RB Extend
            break;

        case 0x0B:
            HAL_GPIO_WritePin(GPIOC, GPIO_PIN_4, GPIO_PIN_RESET);  // RB Extend OFF
            HAL_GPIO_WritePin(GPIOB, GPIO_PIN_0, pinState);        // RB Retract
            break;

        case 0x0C:
            HAL_GPIO_WritePin(GPIOE, GPIO_PIN_9, GPIO_PIN_RESET);  // Rear Down OFF
            HAL_GPIO_WritePin(GPIOE, GPIO_PIN_7, pinState);        // Rear Up
            break;

        case 0x0D:
            HAL_GPIO_WritePin(GPIOE, GPIO_PIN_7, GPIO_PIN_RESET);  // Rear Up OFF
            HAL_GPIO_WritePin(GPIOE, GPIO_PIN_9, pinState);        // Rear Down
            break;

        case 0x0E:
            HAL_GPIO_WritePin(GPIOE, GPIO_PIN_13, GPIO_PIN_RESET); // FL Down OFF
            HAL_GPIO_WritePin(GPIOE, GPIO_PIN_11, pinState);       // FL Up
            break;

        case 0x0F:
            HAL_GPIO_WritePin(GPIOE, GPIO_PIN_11, GPIO_PIN_RESET); // FL Up OFF
            HAL_GPIO_WritePin(GPIOE, GPIO_PIN_13, pinState);       // FL Down
            break;

        case 0x10:
            HAL_GPIO_WritePin(GPIOE, GPIO_PIN_3, GPIO_PIN_RESET);  // Sweeping OFF
            HAL_GPIO_WritePin(GPIOE, GPIO_PIN_15, pinState);       // Litter
            break;

        case 0x11:
            HAL_GPIO_WritePin(GPIOE, GPIO_PIN_15, GPIO_PIN_RESET); // Litter OFF
            HAL_GPIO_WritePin(GPIOE, GPIO_PIN_3, pinState);        // Sweeping
            break;

        case 0x12:
            HAL_GPIO_WritePin(GPIOC, GPIO_PIN_13, GPIO_PIN_RESET); // FCA Close OFF
            HAL_GPIO_WritePin(GPIOE, GPIO_PIN_5, pinState);        // FCA Open
            break;

        case 0x13:
            HAL_GPIO_WritePin(GPIOE, GPIO_PIN_5, GPIO_PIN_RESET);  // FCA Open OFF
            HAL_GPIO_WritePin(GPIOC, GPIO_PIN_13, pinState);       // FCA Close
            break;

        case 0x14:
            HAL_GPIO_WritePin(GPIOC, GPIO_PIN_1, pinState);        // Filter Cleaning Motor
            break;

        case 0x17:
            HAL_GPIO_WritePin(GPIOE, GPIO_PIN_4, GPIO_PIN_RESET);  // FR Down OFF
            HAL_GPIO_WritePin(GPIOE, GPIO_PIN_2, pinState);        // FR Up
            break;

        case 0x18:
            HAL_GPIO_WritePin(GPIOE, GPIO_PIN_2, GPIO_PIN_RESET);  // FR Up OFF
            HAL_GPIO_WritePin(GPIOE, GPIO_PIN_4, pinState);        // FR Down
            break;

        case 0x19:
            HAL_GPIO_WritePin(GPIOE, GPIO_PIN_6, pinState);        // Front Left Brush Motor
            break;

        case 0x1A:
            HAL_GPIO_WritePin(GPIOC, GPIO_PIN_0, pinState);        // Front Right Brush Motor
            break;

        case 0x1B:
            HAL_GPIO_WritePin(GPIOC, GPIO_PIN_2, pinState);        // Rear Brush Motor
            break;

        default:
            valid_cmd = 0;
            break;
    }

    if(valid_cmd)
    {
        uint8_t actual_state = Get_GPIO_State(cmd);
        CAN_Send_GPIO_Status(cmd, actual_state);
    }
}

void CAN_RecoverFromBusOff(void)
{
    /* AutoBusOff is enabled — recover if wiring/no-ACK errors put CAN in bus-off. */
    if((hcan1.Instance->ESR & CAN_ESR_BOFF) != 0U)
    {
        HAL_CAN_Stop(&hcan1);
        HAL_CAN_Start(&hcan1);
    }
}

uint8_t Get_GPIO_State(uint8_t cmd)
{
    GPIO_PinState pinState = GPIO_PIN_RESET;

    switch(cmd)
    {
        case 0x01: pinState = HAL_GPIO_ReadPin(GPIOA, GPIO_PIN_7);  break;  // Suction
        case 0x02: pinState = HAL_GPIO_ReadPin(GPIOC, GPIO_PIN_5);  break;  // Jet Spray
        case 0x03: pinState = HAL_GPIO_ReadPin(GPIOB, GPIO_PIN_1);  break;  // Brush Spray
        case 0x04: pinState = HAL_GPIO_ReadPin(GPIOE, GPIO_PIN_8);  break;  // Dump Up
        case 0x05: pinState = HAL_GPIO_ReadPin(GPIOE, GPIO_PIN_10); break;  // Dump Down
        case 0x06: pinState = HAL_GPIO_ReadPin(GPIOE, GPIO_PIN_12); break;  // Gate Open
        case 0x07: pinState = HAL_GPIO_ReadPin(GPIOE, GPIO_PIN_14); break;  // Gate Close
        case 0x08: pinState = HAL_GPIO_ReadPin(GPIOB, GPIO_PIN_10); break;  // Left Brush Extend
        case 0x09: pinState = HAL_GPIO_ReadPin(GPIOA, GPIO_PIN_6);  break;  // Left Brush Retract
        case 0x0A: pinState = HAL_GPIO_ReadPin(GPIOC, GPIO_PIN_4);  break;  // Right Brush Extend
        case 0x0B: pinState = HAL_GPIO_ReadPin(GPIOB, GPIO_PIN_0);  break;  // Right Brush Retract
        case 0x0C: pinState = HAL_GPIO_ReadPin(GPIOE, GPIO_PIN_7);  break;  // Rear Brush Up
        case 0x0D: pinState = HAL_GPIO_ReadPin(GPIOE, GPIO_PIN_9);  break;  // Rear Brush Down
        case 0x0E: pinState = HAL_GPIO_ReadPin(GPIOE, GPIO_PIN_11); break;  // Front Left Brush Up
        case 0x0F: pinState = HAL_GPIO_ReadPin(GPIOE, GPIO_PIN_13); break;  // Front Left Brush Down
        case 0x10: pinState = HAL_GPIO_ReadPin(GPIOE, GPIO_PIN_15); break;  // Litter Picker Mode
        case 0x11: pinState = HAL_GPIO_ReadPin(GPIOE, GPIO_PIN_3);  break;  // Sweeping Mode
        case 0x12: pinState = HAL_GPIO_ReadPin(GPIOE, GPIO_PIN_5);  break;  // Filter Cleaning Open
        case 0x13: pinState = HAL_GPIO_ReadPin(GPIOC, GPIO_PIN_13); break;  // Filter Cleaning Close
        case 0x14: pinState = HAL_GPIO_ReadPin(GPIOC, GPIO_PIN_1);  break;  // Filter Cleaning Motor
        case 0x16: pinState = HAL_GPIO_ReadPin(GPIOC, GPIO_PIN_3);  break;  // Emergency Input
        case 0x17: pinState = HAL_GPIO_ReadPin(GPIOE, GPIO_PIN_2);  break;  // Front Right Brush Up
        case 0x18: pinState = HAL_GPIO_ReadPin(GPIOE, GPIO_PIN_4);  break;  // Front Right Brush Down
        case 0x19: pinState = HAL_GPIO_ReadPin(GPIOE, GPIO_PIN_6);  break;  // Front Left Brush Motor
        case 0x1A: pinState = HAL_GPIO_ReadPin(GPIOC, GPIO_PIN_0);  break;  // Front Right Brush Motor
        case 0x1B: pinState = HAL_GPIO_ReadPin(GPIOC, GPIO_PIN_2);  break;  // Rear Brush Motor

        default:
            return 0;
    }

    return (pinState == GPIO_PIN_SET) ? 1 : 0;
}

void CAN_Filter_Config(void)
{
    CAN_FilterTypeDef sFilterConfig;

    sFilterConfig.FilterBank = 0;
    sFilterConfig.FilterMode = CAN_FILTERMODE_IDMASK;
    sFilterConfig.FilterScale = CAN_FILTERSCALE_32BIT;

    sFilterConfig.FilterIdHigh = 0x0000;
    sFilterConfig.FilterIdLow = 0x0000;
    sFilterConfig.FilterMaskIdHigh = 0x0000;
    sFilterConfig.FilterMaskIdLow = 0x0000;

    sFilterConfig.FilterFIFOAssignment = CAN_FILTER_FIFO0;
    sFilterConfig.FilterActivation = ENABLE;
    sFilterConfig.SlaveStartFilterBank = 14;

    if (HAL_CAN_ConfigFilter(&hcan1, &sFilterConfig) != HAL_OK)
    {
        Error_Handler();
    }
}

uint8_t CAN_Send_Safe(CAN_TxHeaderTypeDef *header, uint8_t *data)
{
    uint32_t startTick = HAL_GetTick();

    while (HAL_CAN_GetTxMailboxesFreeLevel(&hcan1) == 0)
    {
        if (HAL_GetTick() - startTick > 20)
        {
            return 0;
        }

        HAL_Delay(1);
    }

    if (HAL_CAN_AddTxMessage(&hcan1, header, data, &TxMailbox) == HAL_OK)
    {
        return 1;
    }

    return 0;
}

void CAN_Send_Distance(uint16_t distance)
{
    TxHeader.StdId = 0x201;
    TxHeader.ExtId = 0x00;
    TxHeader.IDE = CAN_ID_STD;
    TxHeader.RTR = CAN_RTR_DATA;
    TxHeader.DLC = 2;
    TxHeader.TransmitGlobalTime = DISABLE;

    TxData[0] = (distance >> 8) & 0xFF;
    TxData[1] = distance & 0xFF;

    CAN_Send_Safe(&TxHeader, TxData);
}

void CAN_Send_GPIO_Status(uint8_t cmd, uint8_t state)
{
    TxHeader.StdId = 0x202;
    TxHeader.ExtId = 0x00;
    TxHeader.IDE = CAN_ID_STD;
    TxHeader.RTR = CAN_RTR_DATA;
    TxHeader.DLC = 2;
    TxHeader.TransmitGlobalTime = DISABLE;

    TxData[0] = cmd;
    TxData[1] = state;

    CAN_Send_Safe(&TxHeader, TxData);
}

void CAN_Send_A25_Data(uint8_t *data, uint8_t len)
{
    if(len > 8)
    {
        len = 8;
    }

    TxHeader.StdId = 0x203;
    TxHeader.ExtId = 0x00;
    TxHeader.IDE = CAN_ID_STD;
    TxHeader.RTR = CAN_RTR_DATA;
    TxHeader.DLC = len;
    TxHeader.TransmitGlobalTime = DISABLE;

    for(uint8_t i = 0; i < len; i++)
    {
        TxData[i] = data[i];
    }

    CAN_Send_Safe(&TxHeader, TxData);
}

void CAN_Send_PA0_Analog(uint16_t adcValue)
{
    TxHeader.StdId = 0x205;
    TxHeader.ExtId = 0x00;
    TxHeader.IDE = CAN_ID_STD;
    TxHeader.RTR = CAN_RTR_DATA;
    TxHeader.DLC = 2;
    TxHeader.TransmitGlobalTime = DISABLE;

    TxData[0] = (adcValue >> 8) & 0xFF;
    TxData[1] = adcValue & 0xFF;

    CAN_Send_Safe(&TxHeader, TxData);
}

uint16_t Read_ADC1_PA0(void)
{
    // Start ADC conversion by setting SWSTART bit
    ADC1->CR2 |= ADC_CR2_SWSTART;

    // Wait for conversion to complete (EOC bit)
    while(!(ADC1->SR & ADC_SR_EOC));

    // Read and return ADC value
    return (uint16_t)(ADC1->DR & 0x0FFF);
}

static uint8_t USART1_ReadByte(uint8_t *data)
{
    if(USART1->SR & USART_SR_RXNE)
    {
        *data = (uint8_t)(USART1->DR & 0xFF);
        return 1;
    }

    return 0;
}
void Read_A25_Sensor(void)
{
    static uint8_t sensorData[4];
    static uint8_t index = 0;

    uint8_t byteData = 0;

    while(USART1_ReadByte(&byteData))
    {
        /*
          A25 packet appears like:
          FF 05 XX YY

          So we sync packet from 0xFF.
        */

        if(index == 0)
        {
            if(byteData == 0xFF)
            {
                sensorData[index++] = byteData;
            }
        }
        else
        {
            sensorData[index++] = byteData;

            if(index >= 4)
            {
                uint8_t canData[8] = {
                    sensorData[0],
                    sensorData[1],
                    sensorData[2],
                    sensorData[3],
                    0x00,
                    0x00,
                    0x00,
                    0x00
                };

                CAN_Send_A25_Data(canData, 8);

                index = 0;
            }
        }
    }
}
void Set_Suction_DAC(uint16_t dacValue)
{
    if(dacValue > 4095)
    {
        dacValue = 4095;
    }

    DAC->DHR12R2 = dacValue & 0x0FFF;
}

void Process_Front_Up_Sequence(void)
{
    if(frontUpSequenceActive)
    {
        if(HAL_GetTick() - frontUpSequenceStartTime >= 10000)
        {
            // Stop left/right brush retract after 10 seconds
            HAL_GPIO_WritePin(GPIOA, GPIO_PIN_6, GPIO_PIN_RESET);  // LB Retract
            HAL_GPIO_WritePin(GPIOB, GPIO_PIN_0, GPIO_PIN_RESET);  // RB Retract

            CAN_Send_GPIO_Status(0x09, 0);
            CAN_Send_GPIO_Status(0x0B, 0);

            // Stop Front Left Brush Down and turn Front Left Brush Up ON
            HAL_GPIO_WritePin(GPIOE, GPIO_PIN_13, GPIO_PIN_RESET); // FL Brush Down
            HAL_GPIO_WritePin(GPIOE, GPIO_PIN_11, GPIO_PIN_SET);   // FL Brush Up

            CAN_Send_GPIO_Status(0x0F, 0);
            CAN_Send_GPIO_Status(0x0E, 1);

            frontUpSequenceActive = 0;
        }
    }
}

void CAN_Poll_Receive(void)
{
    if(HAL_CAN_GetRxFifoFillLevel(&hcan1, CAN_RX_FIFO0) > 0)
    {
        if(HAL_CAN_GetRxMessage(&hcan1, CAN_RX_FIFO0, &RxHeader, RxData) == HAL_OK)
        {
            if(RxHeader.StdId == 0x200 && RxHeader.DLC >= 2)
            {
                uint8_t cmd = RxData[0];
                uint8_t state = RxData[1];

                CAN_Process_Command(cmd, state);
            }
        }
    }
}

/* USER CODE END 0 */

int main(void)
{
    HAL_Init();

    SystemClock_Config();

    MX_GPIO_Init();
    MX_CAN1_Init();
    MX_DAC_PA5_Init();
    MX_USART1_Register_Init();
    MX_ADC1_PA0_Register_Init();

    CAN_Filter_Config();

    if(HAL_CAN_Start(&hcan1) != HAL_OK)
    {
        Error_Handler();
    }
    uint8_t testA25[8] = {0x11, 0x22, 0x33, 0x44, 0x55, 0x66, 0x77, 0x88};

    CAN_Send_A25_Data(testA25, 8);
    HAL_Delay(100);
    CAN_Send_A25_Data(testA25, 8);
    HAL_Delay(100);
    CAN_Send_A25_Data(testA25, 8);

    /* BOOT TEST FRAME */
    CAN_Send_GPIO_Status(0x55, 0xAA);
    HAL_Delay(100);
    CAN_Send_GPIO_Status(0x55, 0xAA);
    HAL_Delay(100);
    CAN_Send_GPIO_Status(0x55, 0xAA);

    for(int i = 0; i < 28; i++)
    {
        gpioStates[i] = 0;
    }

    /* MAIN LOOP */
    uint32_t lastGpioSendTime = 0;
    uint8_t gpioIndex = 0;

    while (1)
    {
        CAN_RecoverFromBusOff();
        CAN_Poll_Receive();
        Process_Front_Up_Sequence();
        Read_A25_Sensor();

        // Periodic PA0 analog read and send every 200ms
        if (HAL_GetTick() - lastPa0SendTime >= 200)
        {
            lastPa0SendTime = HAL_GetTick();
            uint16_t pa0Adc = Read_ADC1_PA0();
            CAN_Send_PA0_Analog(pa0Adc);
        }

        // Periodic GPIO status send every 1000ms
        if (HAL_GetTick() - lastGpioSendTime >= 1000)
        {
            lastGpioSendTime = HAL_GetTick();

            // Send GPIO status for one command each cycle (round-robin)
            uint8_t cmd = allCommands[gpioIndex];
            uint8_t state = Get_GPIO_State(cmd);
            CAN_Send_GPIO_Status(cmd, state);

            gpioIndex++;
            if (gpioIndex >= totalCommands)
            {
                gpioIndex = 0;
            }

            HAL_GPIO_TogglePin(GPIOD, GPIO_PIN_12);
        }
    }
}

void SystemClock_Config(void)
{
    RCC_OscInitTypeDef RCC_OscInitStruct = {0};
    RCC_ClkInitTypeDef RCC_ClkInitStruct = {0};

    __HAL_RCC_PWR_CLK_ENABLE();
    __HAL_PWR_VOLTAGESCALING_CONFIG(PWR_REGULATOR_VOLTAGE_SCALE1);

    RCC_OscInitStruct.OscillatorType = RCC_OSCILLATORTYPE_HSI;
    RCC_OscInitStruct.HSIState = RCC_HSI_ON;
    RCC_OscInitStruct.HSICalibrationValue = RCC_HSICALIBRATION_DEFAULT;

    RCC_OscInitStruct.PLL.PLLState = RCC_PLL_ON;
    RCC_OscInitStruct.PLL.PLLSource = RCC_PLLSOURCE_HSI;
    RCC_OscInitStruct.PLL.PLLM = 16;
    RCC_OscInitStruct.PLL.PLLN = 336;
    RCC_OscInitStruct.PLL.PLLP = RCC_PLLP_DIV2;
    RCC_OscInitStruct.PLL.PLLQ = 4;

    if (HAL_RCC_OscConfig(&RCC_OscInitStruct) != HAL_OK)
    {
        Error_Handler();
    }

    RCC_ClkInitStruct.ClockType = RCC_CLOCKTYPE_HCLK | RCC_CLOCKTYPE_SYSCLK
                                | RCC_CLOCKTYPE_PCLK1 | RCC_CLOCKTYPE_PCLK2;

    RCC_ClkInitStruct.SYSCLKSource = RCC_SYSCLKSOURCE_PLLCLK;
    RCC_ClkInitStruct.AHBCLKDivider = RCC_SYSCLK_DIV1;
    RCC_ClkInitStruct.APB1CLKDivider = RCC_HCLK_DIV4;
    RCC_ClkInitStruct.APB2CLKDivider = RCC_HCLK_DIV2;

    if (HAL_RCC_ClockConfig(&RCC_ClkInitStruct, FLASH_LATENCY_5) != HAL_OK)
    {
        Error_Handler();
    }
}
static void MX_DAC_PA5_Init(void)
{
    RCC->APB1ENR |= RCC_APB1ENR_DACEN;

    volatile uint32_t tmp = RCC->APB1ENR;
    (void)tmp;

    // Disable Channel 2 before configuration
    DAC->CR &= ~DAC_CR_EN2;

    // Trigger disabled and output buffer enabled
    DAC->CR &= ~(DAC_CR_TEN2 | DAC_CR_BOFF2);

    // Initial output 0V
    DAC->DHR12R2 = 0;

    // Enable DAC Channel 2 on PA5
    DAC->CR |= DAC_CR_EN2;
}
static void MX_CAN1_Init(void)
{
    hcan1.Instance = CAN1;

    hcan1.Init.Prescaler = 21;
    hcan1.Init.Mode = CAN_MODE_NORMAL;
    hcan1.Init.SyncJumpWidth = CAN_SJW_1TQ;
    hcan1.Init.TimeSeg1 = CAN_BS1_13TQ;
    hcan1.Init.TimeSeg2 = CAN_BS2_2TQ;

    hcan1.Init.TimeTriggeredMode = DISABLE;
    hcan1.Init.AutoBusOff = ENABLE;
    hcan1.Init.AutoWakeUp = DISABLE;
    hcan1.Init.AutoRetransmission = ENABLE;
    hcan1.Init.ReceiveFifoLocked = DISABLE;
    hcan1.Init.TransmitFifoPriority = DISABLE;

    if (HAL_CAN_Init(&hcan1) != HAL_OK)
    {
        Error_Handler();
    }
}

static void MX_USART1_Register_Init(void)
{
    GPIO_InitTypeDef GPIO_InitStruct = {0};

    __HAL_RCC_GPIOA_CLK_ENABLE();
    __HAL_RCC_USART1_CLK_ENABLE();

    /*
      PA9  = USART1_TX
      PA10 = USART1_RX
    */
    GPIO_InitStruct.Pin = GPIO_PIN_9 | GPIO_PIN_10;
    GPIO_InitStruct.Mode = GPIO_MODE_AF_PP;
    GPIO_InitStruct.Pull = GPIO_PULLUP;
    GPIO_InitStruct.Speed = GPIO_SPEED_FREQ_VERY_HIGH;
    GPIO_InitStruct.Alternate = GPIO_AF7_USART1;
    HAL_GPIO_Init(GPIOA, &GPIO_InitStruct);

    /*
      Disable USART1 before config
    */
    USART1->CR1 &= ~USART_CR1_UE;


    /*
      Baudrate 115200
      APB2/PCLK2 = 84MHz
      BRR = 84000000 / 115200 = approx 729 = 0x02D9
    */
    USART1->BRR = 0x02D9;

    /*
      8 bit, no parity, RX enable, TX enable
    */
    USART1->CR1 = USART_CR1_RE | USART_CR1_TE;

    /*
      1 stop bit
    */
    USART1->CR2 = 0x0000;

    /*
      No hardware flow control
    */
    USART1->CR3 = 0x0000;

    /*
      Enable USART1
    */
    USART1->CR1 |= USART_CR1_UE;
}

static void MX_GPIO_Init(void)
{
    GPIO_InitTypeDef GPIO_InitStruct = {0};

    __HAL_RCC_GPIOE_CLK_ENABLE();
    __HAL_RCC_GPIOC_CLK_ENABLE();
    __HAL_RCC_GPIOA_CLK_ENABLE();
    __HAL_RCC_GPIOB_CLK_ENABLE();
    __HAL_RCC_GPIOD_CLK_ENABLE();

    // Reset all output pins first
    HAL_GPIO_WritePin(GPIOA, GPIO_PIN_6 | GPIO_PIN_7, GPIO_PIN_RESET);

    HAL_GPIO_WritePin(GPIOB, GPIO_PIN_0 | GPIO_PIN_1 | GPIO_PIN_10, GPIO_PIN_RESET);

    HAL_GPIO_WritePin(GPIOC, GPIO_PIN_0 | GPIO_PIN_1 | GPIO_PIN_2
                           | GPIO_PIN_4 | GPIO_PIN_5 | GPIO_PIN_13, GPIO_PIN_RESET);

    HAL_GPIO_WritePin(GPIOE, GPIO_PIN_2 | GPIO_PIN_3 | GPIO_PIN_4 | GPIO_PIN_5
                           | GPIO_PIN_6 | GPIO_PIN_7 | GPIO_PIN_8 | GPIO_PIN_9
                           | GPIO_PIN_10 | GPIO_PIN_11 | GPIO_PIN_12 | GPIO_PIN_13
                           | GPIO_PIN_14 | GPIO_PIN_15, GPIO_PIN_RESET);

    HAL_GPIO_WritePin(GPIOD, GPIO_PIN_12, GPIO_PIN_RESET);

    /*
      PA0 = Analog Input (Water Pressure Sensor) - configured in MX_ADC1_PA0_Register_Init
      PA6 = Left Brush Retract
      PA7 = Suction Relay
    */
    GPIO_InitStruct.Pin = GPIO_PIN_6 | GPIO_PIN_7;
    GPIO_InitStruct.Mode = GPIO_MODE_OUTPUT_PP;
    GPIO_InitStruct.Pull = GPIO_NOPULL;
    GPIO_InitStruct.Speed = GPIO_SPEED_FREQ_LOW;
    HAL_GPIO_Init(GPIOA, &GPIO_InitStruct);

    /*
      PA1 = distance echo input
    */
    GPIO_InitStruct.Pin = GPIO_PIN_1;
    GPIO_InitStruct.Mode = GPIO_MODE_INPUT;
    GPIO_InitStruct.Pull = GPIO_NOPULL;
    HAL_GPIO_Init(GPIOA, &GPIO_InitStruct);

    /*
      PA5 = DAC_OUT2 suction analog control
    */
    GPIO_InitStruct.Pin = GPIO_PIN_5;
    GPIO_InitStruct.Mode = GPIO_MODE_ANALOG;
    GPIO_InitStruct.Pull = GPIO_NOPULL;
    HAL_GPIO_Init(GPIOA, &GPIO_InitStruct);

    /*
      PB0  = Right Brush Retract
      PB1  = Brush Spray
      PB10 = Left Brush Extend
    */
    GPIO_InitStruct.Pin = GPIO_PIN_0 | GPIO_PIN_1 | GPIO_PIN_10;
    GPIO_InitStruct.Mode = GPIO_MODE_OUTPUT_PP;
    GPIO_InitStruct.Pull = GPIO_NOPULL;
    GPIO_InitStruct.Speed = GPIO_SPEED_FREQ_LOW;
    HAL_GPIO_Init(GPIOB, &GPIO_InitStruct);

    /*
      PC0  = Front Right Brush Motor
      PC1  = Filter Cleaning Motor
      PC2  = Rear Brush Motor
      PC4  = Right Brush Extend
      PC5  = Jet Spray
      PC13 = Filter Cleaning Close
    */
    GPIO_InitStruct.Pin = GPIO_PIN_0 | GPIO_PIN_1 | GPIO_PIN_2
                        | GPIO_PIN_4 | GPIO_PIN_5 | GPIO_PIN_13;
    GPIO_InitStruct.Mode = GPIO_MODE_OUTPUT_PP;
    GPIO_InitStruct.Pull = GPIO_NOPULL;
    GPIO_InitStruct.Speed = GPIO_SPEED_FREQ_LOW;
    HAL_GPIO_Init(GPIOC, &GPIO_InitStruct);

    /*
      PC3 = Emergency Input
    */
    GPIO_InitStruct.Pin = GPIO_PIN_3;
    GPIO_InitStruct.Mode = GPIO_MODE_INPUT;
    GPIO_InitStruct.Pull = GPIO_PULLUP;
    HAL_GPIO_Init(GPIOC, &GPIO_InitStruct);

    /*
      PE2  = Front Right Brush Up
      PE3  = Sweeping Mode
      PE4  = Front Right Brush Down
      PE5  = Filter Cleaning Open
      PE6  = Front Left Brush Motor
      PE7  = Rear Brush Up
      PE8  = Dump Up
      PE9  = Rear Brush Down
      PE10 = Dump Down
      PE11 = Front Left Brush Up
      PE12 = Gate Open
      PE13 = Front Left Brush Down
      PE14 = Gate Close
      PE15 = Litter Picker Mode
    */
    GPIO_InitStruct.Pin = GPIO_PIN_2 | GPIO_PIN_3 | GPIO_PIN_4 | GPIO_PIN_5
                        | GPIO_PIN_6 | GPIO_PIN_7 | GPIO_PIN_8 | GPIO_PIN_9
                        | GPIO_PIN_10 | GPIO_PIN_11 | GPIO_PIN_12 | GPIO_PIN_13
                        | GPIO_PIN_14 | GPIO_PIN_15;
    GPIO_InitStruct.Mode = GPIO_MODE_OUTPUT_PP;
    GPIO_InitStruct.Pull = GPIO_NOPULL;
    GPIO_InitStruct.Speed = GPIO_SPEED_FREQ_LOW;
    HAL_GPIO_Init(GPIOE, &GPIO_InitStruct);

    GPIO_InitStruct.Pin = GPIO_PIN_12;
    GPIO_InitStruct.Mode = GPIO_MODE_OUTPUT_PP;
    GPIO_InitStruct.Pull = GPIO_NOPULL;
    GPIO_InitStruct.Speed = GPIO_SPEED_FREQ_LOW;
    HAL_GPIO_Init(GPIOD, &GPIO_InitStruct);
}

static void MX_ADC1_PA0_Register_Init(void)
{
    // Enable ADC1 clock
    RCC->APB2ENR |= RCC_APB2ENR_ADC1EN;

    // Configure PA0 as analog input (mode = 00)
    GPIOA->MODER |= GPIO_MODER_MODER0;
    GPIOA->PUPDR &= ~GPIO_PUPDR_PUPDR0;

    // ADC prescaler: PCLK2/4 (PCLK2 = 84MHz, so ADC clock = 21MHz)
    ADC->CCR |= ADC_CCR_ADCPRE_0;
    ADC->CCR &= ~ADC_CCR_ADCPRE_1;

    // Configure ADC1
    ADC1->CR1 = 0;
    ADC1->CR2 = 0;

    // 12-bit resolution (default), right alignment
    ADC1->CR2 |= ADC_CR2_ADON; // Turn ADC ON

    // Wait a bit for ADC to wake up
    for(volatile uint32_t i = 0; i < 10000; i++);

    // Configure ADC for single channel conversion (Channel 0 = PA0)
    ADC1->SQR1 = 0; // 1 conversion
    ADC1->SQR3 = 0; // Channel 0
    ADC1->SMPR2 = ADC_SMPR2_SMP0_2 | ADC_SMPR2_SMP0_1 | ADC_SMPR2_SMP0_0; // 480 cycles sampling time
}

void Error_Handler(void)
{
    __disable_irq();

    while (1)
    {
        HAL_GPIO_TogglePin(GPIOD, GPIO_PIN_12);
        HAL_Delay(100);
    }
}

#ifdef USE_FULL_ASSERT

void assert_failed(uint8_t *file, uint32_t line)
{
}

#endif
