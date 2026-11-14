/* USER CODE BEGIN Header */
/**
  ******************************************************************************
  * @file           : main.c
  * @brief          : CAN Receive Example
  ******************************************************************************
  */
/* USER CODE END Header */
/* Includes ------------------------------------------------------------------*/
#include "main.h"

/* Private includes ----------------------------------------------------------*/
/* USER CODE BEGIN Includes */

/* USER CODE END Includes */

/* Private typedef -----------------------------------------------------------*/
/* USER CODE BEGIN PTD */

/* USER CODE END PTD */

/* Private define ------------------------------------------------------------*/
/* USER CODE BEGIN PD */

/* USER CODE END PD */

/* Private macro -------------------------------------------------------------*/
/* USER CODE BEGIN PM */

/* USER CODE END PM */

/* Private variables ---------------------------------------------------------*/
CAN_HandleTypeDef hcan1;

/* USER CODE BEGIN PV */

CAN_RxHeaderTypeDef RxHeader;
uint8_t RxData[8];

uint32_t duration = 0;
uint16_t distance_cm = 0;

uint32_t distance_sum = 0;

/* USER CODE END PV */

/* Private function prototypes -----------------------------------------------*/
void SystemClock_Config(void);
static void MX_GPIO_Init(void);
static void MX_CAN1_Init(void);
/* USER CODE BEGIN PFP */

/* USER CODE END PFP */

/* Private user code ---------------------------------------------------------*/
/* USER CODE BEGIN 0 */

uint32_t Read_Distance(void)
{
    uint32_t count = 0;
    uint32_t timeout = 30000;

    // Trigger LOW
    HAL_GPIO_WritePin(GPIOA, GPIO_PIN_0, GPIO_PIN_RESET);

    for(volatile int i = 0; i < 50; i++);

    // Trigger HIGH
    HAL_GPIO_WritePin(GPIOA, GPIO_PIN_0, GPIO_PIN_SET);

    for(volatile int i = 0; i < 150; i++);

    // Trigger LOW
    HAL_GPIO_WritePin(GPIOA, GPIO_PIN_0, GPIO_PIN_RESET);

    // Wait for echo HIGH
    timeout = 30000;

    while(HAL_GPIO_ReadPin(GPIOA, GPIO_PIN_1) == GPIO_PIN_RESET)
    {
        if(timeout-- == 0)
            return 0;
    }

    // Measure pulse width
    timeout = 30000;

    while(HAL_GPIO_ReadPin(GPIOA, GPIO_PIN_1) == GPIO_PIN_SET)
    {
        count++;

        // small fixed delay
        for(volatile int i = 0; i < 10; i++);

        if(timeout-- == 0)
            break;
    }

    return count;
}

/* USER CODE END 0 */

/**
  * @brief  The application entry point.
  * @retval int
  */
int main(void)
{

  /* USER CODE BEGIN 1 */

  /* USER CODE END 1 */

  /* MCU Configuration--------------------------------------------------------*/

  /* Reset of all peripherals, Initializes the Flash interface and the Systick. */
  HAL_Init();

  /* USER CODE BEGIN Init */

  /* USER CODE END Init */

  /* Configure the system clock */
  SystemClock_Config();

  /* USER CODE BEGIN SysInit */

  /* USER CODE END SysInit */

  /* Initialize all configured peripherals */
  MX_GPIO_Init();
  MX_CAN1_Init();
  /* USER CODE BEGIN 2 */

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

  HAL_CAN_ConfigFilter(&hcan1, &sFilterConfig);

  HAL_CAN_Start(&hcan1);

  HAL_CAN_ActivateNotification(
      &hcan1,
      CAN_IT_RX_FIFO0_MSG_PENDING
  );

  /* USER CODE END 2 */

  /* Infinite loop */
  /* USER CODE BEGIN WHILE */
  while (1)
  {
    /* USER CODE END WHILE */

	      distance_sum = 0;

	      for(int i = 0; i < 10; i++)
	      {
	          duration = Read_Distance();

	          distance_sum += duration;

	          HAL_Delay(20);
	      }

	      duration = distance_sum / 10;

	      distance_cm = duration / 2;

	      HAL_Delay(200);

    /* USER CODE BEGIN 3 */
  }
  /* USER CODE END 3 */
}

/**
  * @brief System Clock Configuration
  * @retval None
  */
void SystemClock_Config(void)
{
  RCC_OscInitTypeDef RCC_OscInitStruct = {0};
  RCC_ClkInitTypeDef RCC_ClkInitStruct = {0};

  /** Configure the main internal regulator output voltage
  */
  __HAL_RCC_PWR_CLK_ENABLE();
  __HAL_PWR_VOLTAGESCALING_CONFIG(PWR_REGULATOR_VOLTAGE_SCALE1);

  /** Initializes the RCC Oscillators according to the specified parameters
  * in the RCC_OscInitTypeDef structure.
  */
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

  /** Initializes the CPU, AHB and APB buses clocks
  */
  RCC_ClkInitStruct.ClockType = RCC_CLOCKTYPE_HCLK|RCC_CLOCKTYPE_SYSCLK
                              |RCC_CLOCKTYPE_PCLK1|RCC_CLOCKTYPE_PCLK2;
  RCC_ClkInitStruct.SYSCLKSource = RCC_SYSCLKSOURCE_PLLCLK;
  RCC_ClkInitStruct.AHBCLKDivider = RCC_SYSCLK_DIV1;
  RCC_ClkInitStruct.APB1CLKDivider = RCC_HCLK_DIV4;
  RCC_ClkInitStruct.APB2CLKDivider = RCC_HCLK_DIV2;

  if (HAL_RCC_ClockConfig(&RCC_ClkInitStruct, FLASH_LATENCY_5) != HAL_OK)
  {
    Error_Handler();
  }
}

/**
  * @brief CAN1 Initialization Function
  * @param None
  * @retval None
  */
static void MX_CAN1_Init(void)
{

  /* USER CODE BEGIN CAN1_Init 0 */

  /* USER CODE END CAN1_Init 0 */

  /* USER CODE BEGIN CAN1_Init 1 */

  /* USER CODE END CAN1_Init 1 */
  hcan1.Instance = CAN1;
  hcan1.Init.Prescaler = 21;
  hcan1.Init.Mode = CAN_MODE_NORMAL;
  hcan1.Init.SyncJumpWidth = CAN_SJW_1TQ;
  hcan1.Init.TimeSeg1 = CAN_BS1_13TQ;
  hcan1.Init.TimeSeg2 = CAN_BS2_2TQ;
  hcan1.Init.TimeTriggeredMode = DISABLE;
  hcan1.Init.AutoBusOff = DISABLE;
  hcan1.Init.AutoWakeUp = DISABLE;
  hcan1.Init.AutoRetransmission = ENABLE;
  hcan1.Init.ReceiveFifoLocked = DISABLE;
  hcan1.Init.TransmitFifoPriority = DISABLE;
  if (HAL_CAN_Init(&hcan1) != HAL_OK)
  {
    Error_Handler();
  }
  /* USER CODE BEGIN CAN1_Init 2 */

  /* USER CODE END CAN1_Init 2 */

}

/**
  * @brief GPIO Initialization Function
  * @param None
  * @retval None
  */
static void MX_GPIO_Init(void)
{
  GPIO_InitTypeDef GPIO_InitStruct = {0};
  /* USER CODE BEGIN MX_GPIO_Init_1 */

  /* USER CODE END MX_GPIO_Init_1 */

  /* GPIO Ports Clock Enable */
  __HAL_RCC_GPIOE_CLK_ENABLE();
  __HAL_RCC_GPIOC_CLK_ENABLE();
  __HAL_RCC_GPIOA_CLK_ENABLE();
  __HAL_RCC_GPIOB_CLK_ENABLE();
  __HAL_RCC_GPIOD_CLK_ENABLE();

  /*Configure GPIO pin Output Level */
  HAL_GPIO_WritePin(GPIOE, GPIO_PIN_2|GPIO_PIN_3|GPIO_PIN_4|GPIO_PIN_5
                          |GPIO_PIN_6|GPIO_PIN_0|GPIO_PIN_1, GPIO_PIN_RESET);

  /*Configure GPIO pin Output Level */
  HAL_GPIO_WritePin(GPIOC, GPIO_PIN_0|GPIO_PIN_1|GPIO_PIN_2|GPIO_PIN_3
                          |GPIO_PIN_4|GPIO_PIN_5, GPIO_PIN_RESET);

  /*Configure GPIO pin Output Level */
  HAL_GPIO_WritePin(GPIOA, GPIO_PIN_0, GPIO_PIN_RESET);

  /*Configure GPIO pin Output Level */
  HAL_GPIO_WritePin(GPIOB, GPIO_PIN_0|GPIO_PIN_1|GPIO_PIN_2|GPIO_PIN_10
                          |GPIO_PIN_11|GPIO_PIN_12|GPIO_PIN_13|GPIO_PIN_14, GPIO_PIN_RESET);

  /*Configure GPIO pin Output Level */
  HAL_GPIO_WritePin(GPIOD, GPIO_PIN_12, GPIO_PIN_RESET);

  /*Configure GPIO pins : PE2 PE3 PE4 PE5
                           PE6 PE0 PE1 */
  GPIO_InitStruct.Pin = GPIO_PIN_2|GPIO_PIN_3|GPIO_PIN_4|GPIO_PIN_5
                          |GPIO_PIN_6|GPIO_PIN_0|GPIO_PIN_1;
  GPIO_InitStruct.Mode = GPIO_MODE_OUTPUT_PP;
  GPIO_InitStruct.Pull = GPIO_NOPULL;
  GPIO_InitStruct.Speed = GPIO_SPEED_FREQ_LOW;
  HAL_GPIO_Init(GPIOE, &GPIO_InitStruct);

  /*Configure GPIO pins : PC0 PC1 PC2 PC3
                           PC4 PC5 */
  GPIO_InitStruct.Pin = GPIO_PIN_0|GPIO_PIN_1|GPIO_PIN_2|GPIO_PIN_3
                          |GPIO_PIN_4|GPIO_PIN_5;
  GPIO_InitStruct.Mode = GPIO_MODE_OUTPUT_PP;
  GPIO_InitStruct.Pull = GPIO_NOPULL;
  GPIO_InitStruct.Speed = GPIO_SPEED_FREQ_LOW;
  HAL_GPIO_Init(GPIOC, &GPIO_InitStruct);

  /*Configure GPIO pin : PA0 */
  GPIO_InitStruct.Pin = GPIO_PIN_0;
  GPIO_InitStruct.Mode = GPIO_MODE_OUTPUT_PP;
  GPIO_InitStruct.Pull = GPIO_NOPULL;
  GPIO_InitStruct.Speed = GPIO_SPEED_FREQ_LOW;
  HAL_GPIO_Init(GPIOA, &GPIO_InitStruct);

  /*Configure GPIO pin : PA1 */
  GPIO_InitStruct.Pin = GPIO_PIN_1;
  GPIO_InitStruct.Mode = GPIO_MODE_INPUT;
  GPIO_InitStruct.Pull = GPIO_NOPULL;
  HAL_GPIO_Init(GPIOA, &GPIO_InitStruct);

  /*Configure GPIO pins : PB0 PB1 PB2 PB10
                           PB11 PB12 PB13 PB14 */
  GPIO_InitStruct.Pin = GPIO_PIN_0|GPIO_PIN_1|GPIO_PIN_2|GPIO_PIN_10
                          |GPIO_PIN_11|GPIO_PIN_12|GPIO_PIN_13|GPIO_PIN_14;
  GPIO_InitStruct.Mode = GPIO_MODE_OUTPUT_PP;
  GPIO_InitStruct.Pull = GPIO_NOPULL;
  GPIO_InitStruct.Speed = GPIO_SPEED_FREQ_LOW;
  HAL_GPIO_Init(GPIOB, &GPIO_InitStruct);

  /*Configure GPIO pin : PD12 */
  GPIO_InitStruct.Pin = GPIO_PIN_12;
  GPIO_InitStruct.Mode = GPIO_MODE_OUTPUT_PP;
  GPIO_InitStruct.Pull = GPIO_NOPULL;
  GPIO_InitStruct.Speed = GPIO_SPEED_FREQ_LOW;
  HAL_GPIO_Init(GPIOD, &GPIO_InitStruct);

  /* USER CODE BEGIN MX_GPIO_Init_2 */

  /* USER CODE END MX_GPIO_Init_2 */
}

/* USER CODE BEGIN 4 */

void HAL_CAN_RxFifo0MsgPendingCallback(
    CAN_HandleTypeDef *hcan
)
{
    HAL_CAN_GetRxMessage(
        hcan,
        CAN_RX_FIFO0,
        &RxHeader,
        RxData
    );

    if(RxHeader.StdId != 0x200)
        return;

    uint8_t cmd   = RxData[0];
    uint8_t state = RxData[1];

    GPIO_PinState pinState;

    if(state)
        pinState = GPIO_PIN_SET;
    else
        pinState = GPIO_PIN_RESET;

    switch(cmd)
    {

        case 0x01: // Suction
            HAL_GPIO_WritePin(GPIOE, GPIO_PIN_0, pinState);
            break;

        case 0x02: // Jet Spray
            HAL_GPIO_WritePin(GPIOE, GPIO_PIN_1, pinState);
            break;

        case 0x03: // Brush Spray
            HAL_GPIO_WritePin(GPIOE, GPIO_PIN_2, pinState);
            break;

        case 0x04: // Dump Up

            HAL_GPIO_WritePin(
                GPIOE,
                GPIO_PIN_4,
                GPIO_PIN_RESET
            );

            HAL_GPIO_WritePin(
                GPIOE,
                GPIO_PIN_3,
                pinState
            );

            break;

        case 0x05: // Dump Down

            HAL_GPIO_WritePin(
                GPIOE,
                GPIO_PIN_3,
                GPIO_PIN_RESET
            );

            HAL_GPIO_WritePin(
                GPIOE,
                GPIO_PIN_4,
                pinState
            );

            break;

        case 0x06: // Gate Open

            HAL_GPIO_WritePin(
                GPIOE,
                GPIO_PIN_6,
                GPIO_PIN_RESET
            );

            HAL_GPIO_WritePin(
                GPIOE,
                GPIO_PIN_5,
                pinState
            );

            break;

        case 0x07: // Gate Close

            HAL_GPIO_WritePin(
                GPIOE,
                GPIO_PIN_5,
                GPIO_PIN_RESET
            );

            HAL_GPIO_WritePin(
                GPIOE,
                GPIO_PIN_6,
                pinState
            );

            break;

        case 0x08: // LB Extend

            HAL_GPIO_WritePin(
                GPIOB,
                GPIO_PIN_1,
                GPIO_PIN_RESET
            );

            HAL_GPIO_WritePin(
                GPIOB,
                GPIO_PIN_0,
                pinState
            );

            break;

        case 0x09: // LB Retract

            HAL_GPIO_WritePin(
                GPIOB,
                GPIO_PIN_0,
                GPIO_PIN_RESET
            );

            HAL_GPIO_WritePin(
                GPIOB,
                GPIO_PIN_1,
                pinState
            );

            break;

        case 0x0A: // RB Extend

            HAL_GPIO_WritePin(
                GPIOB,
                GPIO_PIN_10,
                GPIO_PIN_RESET
            );

            HAL_GPIO_WritePin(
                GPIOB,
                GPIO_PIN_2,
                pinState
            );

            break;

        case 0x0B: // RB Retract

            HAL_GPIO_WritePin(
                GPIOB,
                GPIO_PIN_2,
                GPIO_PIN_RESET
            );

            HAL_GPIO_WritePin(
                GPIOB,
                GPIO_PIN_10,
                pinState
            );

            break;

        case 0x0C: // RB Up

            HAL_GPIO_WritePin(
                GPIOB,
                GPIO_PIN_12,
                GPIO_PIN_RESET
            );

            HAL_GPIO_WritePin(
                GPIOB,
                GPIO_PIN_11,
                pinState
            );

            break;

        case 0x0D: // RB Down

            HAL_GPIO_WritePin(
                GPIOB,
                GPIO_PIN_11,
                GPIO_PIN_RESET
            );

            HAL_GPIO_WritePin(
                GPIOB,
                GPIO_PIN_12,
                pinState
            );

            break;

        case 0x0E: // FB Up

            HAL_GPIO_WritePin(
                GPIOB,
                GPIO_PIN_14,
                GPIO_PIN_RESET
            );

            HAL_GPIO_WritePin(
                GPIOB,
                GPIO_PIN_13,
                pinState
            );

            break;

        case 0x0F: // FB Down

            HAL_GPIO_WritePin(
                GPIOB,
                GPIO_PIN_13,
                GPIO_PIN_RESET
            );

            HAL_GPIO_WritePin(
                GPIOB,
                GPIO_PIN_14,
                pinState
            );

            break;

        case 0x10: // Litter ON

            HAL_GPIO_WritePin(
                GPIOC,
                GPIO_PIN_1,
                GPIO_PIN_RESET
            );

            HAL_GPIO_WritePin(
                GPIOC,
                GPIO_PIN_0,
                pinState
            );

            break;

        case 0x11: // Sweeping ON

            HAL_GPIO_WritePin(
                GPIOC,
                GPIO_PIN_0,
                GPIO_PIN_RESET
            );

            HAL_GPIO_WritePin(
                GPIOC,
                GPIO_PIN_1,
                pinState
            );

            break;

        case 0x12: // FCA Open

            HAL_GPIO_WritePin(
                GPIOC,
                GPIO_PIN_4,
                GPIO_PIN_RESET
            );

            HAL_GPIO_WritePin(
                GPIOC,
                GPIO_PIN_3,
                pinState
            );

            break;

        case 0x13: // FCA Close

            HAL_GPIO_WritePin(
                GPIOC,
                GPIO_PIN_3,
                GPIO_PIN_RESET
            );

            HAL_GPIO_WritePin(
                GPIOC,
                GPIO_PIN_4,
                pinState
            );

            break;

        case 0x14: // Filter Motor

            HAL_GPIO_WritePin(
                GPIOC,
                GPIO_PIN_5,
                pinState
            );

            break;
    }
}

/* USER CODE END 4 */

/**
  * @brief  This function is executed in case of error occurrence.
  * @retval None
  */
void Error_Handler(void)
{
  /* USER CODE BEGIN Error_Handler_Debug */
  /* User can add his own implementation to report the HAL error return state */
  __disable_irq();
  while (1)
  {
  }
  /* USER CODE END Error_Handler_Debug */
}
#ifdef USE_FULL_ASSERT
/**
  * @brief  Reports the name of the source file and the source line number
  *         where the assert_param error has occurred.
  * @param  file: pointer to the source file name
  * @param  line: assert_param error line source number
  * @retval None
  */
void assert_failed(uint8_t *file, uint32_t line)
{
  /* USER CODE BEGIN 6 */
  /* User can add his own implementation to report the file name and line number,
     ex: printf("Wrong parameters value: file %s on line %d\r\n", file, line) */
  /* USER CODE END 6 */
}
#endif /* USE_FULL_ASSERT */
