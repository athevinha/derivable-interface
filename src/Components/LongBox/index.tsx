import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { Text, TextGrey } from '../ui/Text'
import './style.scss'
import { Box } from '../ui/Box'
import { ButtonExecute } from '../ui/Button'
import 'rc-slider/assets/index.css'
import { IconArrowDown } from '../ui/Icon'
import { Input } from '../ui/Input'
import { TokenIcon } from '../ui/TokenIcon'
import { useCurrentPool } from '../../state/currentPool/hooks/useCurrentPool'
import { useWeb3React } from '../../state/customWeb3React/hook'
import { BigNumber } from 'ethers'
import { SelectTokenModal } from '../SelectTokenModal'
import { useWalletBalance } from '../../state/wallet/hooks/useBalances'
import { useListTokens } from '../../state/token/hook'
import {
  bn,
  decodeErc1155Address, formatFloat, isErc1155Address, mul,
  numberToWei,
  parseCallStaticError,
  weiToNumber
} from '../../utils/helpers'
import { TokenSymbol } from '../ui/TokenSymbol'
import { SkeletonLoader } from '../ui/SkeletonLoader'
import { NATIVE_ADDRESS, POOL_IDS } from '../../utils/constant'
import { PowerState } from 'powerLib'
import { useConfigs } from '../../state/config/useConfigs'
import { formatWeiToDisplayNumber } from '../../utils/formatBalance'
import isEqual from 'react-fast-compare'
import { useNativePrice } from '../../hooks/useTokenPrice'
import { toast } from 'react-toastify'
import { ApproveUtrModal } from '../ApproveUtrModal'
import { useSwapHistory } from '../../state/wallet/hooks/useSwapHistory'
import _ from 'lodash'
import { LeverageSlider } from '../Slider'
import { useGenerateLeverageData } from '../../hooks/useGenerateLeverageData'

const Component = () => {
  const [leverage, setLeverage] = useState<number>(1)
  const { account, showConnectModal } = useWeb3React()
  const { configs, ddlEngine } = useConfigs()
  const { states, powers, allTokens, id, pools } = useCurrentPool()
  const [inputTokenAddress, setInputTokenAddress] = useState<string>('')
  const [visibleSelectTokenModal, setVisibleSelectTokenModal] = useState<boolean>(false)
  const [tokenTypeToSelect, setTokenTypeToSelect] = useState<'input' | 'output'>('input')
  const [callError, setCallError] = useState<string>('')
  const [amountOut, setAmountOut] = useState<string>('')
  const [amountOutWei, setAmountOutWei] = useState<BigNumber>(bn(0))
  const [amountIn, setAmountIn] = useState<string>('')
  const { balances, fetchBalanceAndAllowance, accFetchBalance } = useWalletBalance()
  const [txFee, setTxFee] = useState<BigNumber>(bn(0))
  const [gasUsed, setGasUsed] = useState<BigNumber>(bn(0))
  const [loading, setLoading] = useState<boolean>(false)
  const [visibleApproveModal, setVisibleApproveModal] = useState<boolean>(false)
  const { tokens } = useListTokens()
  const { updateSwapTxsHandle } = useSwapHistory()
  const { data: nativePrice } = useNativePrice()

  const leverageData = useGenerateLeverageData()

  const outputTokenAddress = useMemo(() => {
    for (const poolAddress in pools) {
      if (leverage === pools[poolAddress].k.toNumber()) {
        return poolAddress + '-' + POOL_IDS.A
      }
    }
    return ''
  }, [leverage, pools])

  useEffect(() => {
    if (outputTokenAddress) {
      const { address } = decodeErc1155Address(outputTokenAddress)
      setInputTokenAddress(pools[address].TOKEN_R)
    } else if (Object.values(pools).length > 0) {
      setInputTokenAddress(Object.values(pools)[0].TOKEN_R)
    }
  }, [outputTokenAddress, pools])

  useEffect(() => {
    if (tokens[inputTokenAddress] && tokens[outputTokenAddress] && amountIn && Number(amountIn)) {
      calcAmountOut()
    } else if (Number(amountIn) === 0) {
      setAmountOut('')
      setTxFee(bn(0))
      setGasUsed(bn(0))
      setAmountOutWei(bn(0))
    }
  }, [tokens[inputTokenAddress] && tokens[outputTokenAddress], amountIn])

  const calcAmountOut = async () => {
    if (!amountOut) {
      setCallError('Calculating...')
    }
    // @ts-ignore
    ddlEngine.SWAP.calculateAmountOuts([{
      tokenIn: inputTokenAddress,
      tokenOut: outputTokenAddress,
      amountIn: bn(numberToWei(amountIn, tokens[inputTokenAddress]?.decimal || 18))
    }]).then((res: any) => {
      const [aOuts, gasLeft] = res
      console.log(aOuts)
      setAmountOutWei(aOuts[0]?.amountOut || bn(0))
      setAmountOut(weiToNumber(aOuts[0]?.amountOut || 0, tokens[outputTokenAddress].decimal || 18))
      // @ts-ignore
      setTxFee(detectTxFee(gasLeft))
      // @ts-ignore
      setGasUsed(gasLeft)
      setCallError('')
    }).catch((e: any) => {
      const error = parseCallStaticError(e)
      setAmountOut('0')
      setTxFee(bn(0))
      setGasUsed(bn(0))
      setCallError(error ?? e)
      console.log(e)
    })
  }

  const detectTxFee = (gasUsed: BigNumber) => {
    return gasUsed.mul(2).div(3).mul(5 * 10 ** 9)
  }

  const renderExecuteButton = () => {
    const address = decodeErc1155Address(inputTokenAddress).address

    if (!tokens[inputTokenAddress] || loading) {
      return <ButtonExecute className='swap-button' disabled>Loading...</ButtonExecute>
    } else if (!account) {
      return <ButtonExecute
        onClick={() => {
          showConnectModal()
        }}
        className='swap-button'
      >Connect wallet</ButtonExecute>
    } else if (Number(amountIn) === 0) {
      return <ButtonExecute className='swap-button' disabled>Enter Amount</ButtonExecute>
    } else if (!balances[inputTokenAddress] || balances[inputTokenAddress].lt(numberToWei(amountIn, tokens[inputTokenAddress]?.decimal || 18))) {
      return <ButtonExecute className='swap-button'
        disabled> Insufficient {tokens[inputTokenAddress].symbol} Amount </ButtonExecute>
      // } else if (!routerAllowances[address] || routerAllowances[address].lt(numberToWei(amountIn, tokens[inputTokenAddress]?.decimal || 18))) {
      //   return <ButtonExecute
      //     className='swap-button'
      //     onClick={() => { setVisibleApproveModal(true) }}
      //   >Use EIP-6120</ButtonExecute>
    } else if (callError) {
      return <ButtonExecute className='swap-button' disabled>{callError}</ButtonExecute>
    } else {
      return <ButtonExecute
        className='swap-button'
        onClick={async () => {
          try {
            setLoading(true)
            if (ddlEngine) {
              const tx: any = await ddlEngine.SWAP.multiSwap(
                [{
                  tokenIn: inputTokenAddress,
                  tokenOut: outputTokenAddress,
                  amountIn: bn(numberToWei(amountIn, tokens[inputTokenAddress]?.decimal || 18)),
                  amountOutMin: 0
                }],
                gasUsed && gasUsed.gt(0) ? gasUsed.mul(2) : undefined
              )
              const swapLogs = ddlEngine.RESOURCE.parseDdlLogs(tx && tx?.logs ? tx.logs : [])
              updateSwapTxsHandle(account, swapLogs.filter((l: any) => l.address))
              await fetchBalanceAndAllowance(Object.keys(tokens))
            }
            setLoading(false)
          } catch (e) {
            console.log(e)
            setLoading(false)
            toast.error('Error')
          }
        }}
      >Swap</ButtonExecute>
    }
  }

  const getTokenPrice = (address: string, powerState: any) => {
    return 1
  }

  const valueIn = useMemo(() => {
    if (powers && states.twapBase && Number(amountIn) > 0) {
      const powerState = new PowerState({ powers: [...powers] })
      powerState.loadStates(states)
      const price = getTokenPrice(inputTokenAddress, powerState)
      if (Number(price) === 0 || !Number(price)) {
        return 0
      }
      return formatFloat(weiToNumber(bn(numberToWei(amountIn)).mul(numberToWei(price || 0)), 36), 2)
    }
    return 0
  }, [powers, states, amountIn, inputTokenAddress, nativePrice])

  const valueOut = useMemo(() => {
    if (powers && states.twapBase && Number(amountOut) > 0) {
      const powerState = new PowerState({ powers: [...powers] })
      powerState.loadStates(states)
      const price = getTokenPrice(outputTokenAddress, powerState)
      if (Number(price) === 0 || !Number.isFinite(price)) {
        return 0
      }
      return formatFloat(weiToNumber(bn(numberToWei(amountOut)).mul(numberToWei(price || 0)), 36), 2)
    }
    return 0
  }, [powers, states, amountOut, outputTokenAddress, nativePrice])

  const tokensToSelect = useMemo(() => {
    if (!id) return []
    const tokenRs = Object.values(pools).map((p: any) => p.TOKEN_R)
    if (tokenRs.includes(configs.addresses.wrapToken)) tokenRs.push(configs.addresses.nativeToken)
    return _.uniq(
      [
        ...allTokens,
        ...tokenRs
      ].filter((address) => {
        if (tokenRs.includes(address)) return true
        if (tokenTypeToSelect === 'input' && (!balances[address] || balances[address].isZero())) {
          return false
        }
        return true
      })
    )
  }, [tokenTypeToSelect, allTokens, pools, id])

  const onSelectToken = useCallback((address: string) => {
    if ((tokenTypeToSelect === 'input' && address === outputTokenAddress) ||
      (tokenTypeToSelect === 'output' && address === inputTokenAddress)
    ) {
      // revertPairAddress()
      return
    }
    if (tokenTypeToSelect === 'input') {
      setInputTokenAddress(address)
    } else {
      if (isErc1155Address(address) && isErc1155Address(inputTokenAddress)) {
        const poolOutAddress = decodeErc1155Address(address).address
        const poolOut = pools[poolOutAddress]
        const poolInAddress = decodeErc1155Address(inputTokenAddress).address
        const poolIn = pools[poolInAddress]
        if (poolInAddress !== poolOutAddress && poolOut.TOKEN_R !== poolIn.TOKEN_R) {
          setInputTokenAddress(poolOut.TOKEN_R === configs.addresses.wrapToken ? NATIVE_ADDRESS : poolOut.TOKEN_R)
        }
      }
      if (isErc1155Address(address) && !isErc1155Address(inputTokenAddress)) {
        const poolOut = pools[decodeErc1155Address(address).address]
        setInputTokenAddress(poolOut.TOKEN_R === configs.addresses.wrapToken ? NATIVE_ADDRESS : poolOut.TOKEN_R)
      }
      // setOutputTokenAddress(address)
    }
  }, [pools, inputTokenAddress, outputTokenAddress, tokenTypeToSelect, configs])

  const poolToShow = useMemo(() => {
    if (isErc1155Address(outputTokenAddress)) {
      return pools[decodeErc1155Address(outputTokenAddress).address]
    } else if (isErc1155Address(inputTokenAddress)) {
      return pools[decodeErc1155Address(inputTokenAddress).address]
    }
    return null
  }, [pools, inputTokenAddress, outputTokenAddress])

  return (
    <div className='long-short-box'>
      <div className='amount-input-box'>
        <div className='amount-input-box__head'>
          <SkeletonLoader loading={!tokens[inputTokenAddress]}>
            <span
              className='current-token'
              onClick={(address) => {
                setVisibleSelectTokenModal(true)
                setTokenTypeToSelect('input')
              }}
            >
              <TokenIcon size={24} tokenAddress={inputTokenAddress} />
              <Text><TokenSymbol token={inputTokenAddress} /></Text>
            </span>
          </SkeletonLoader>
          <SkeletonLoader loading={accFetchBalance !== account}>
            <Text
              className='amount-input-box__head--balance'
              onClick={() => {
                setAmountIn(weiToNumber(balances[inputTokenAddress], tokens[inputTokenAddress]?.decimal || 18))
              }}
            >Balance: {balances && balances[inputTokenAddress]
                ? formatWeiToDisplayNumber(
                  balances[inputTokenAddress],
                  4,
                tokens[inputTokenAddress]?.decimal || 18
                )
                : 0
              }
            </Text>
          </SkeletonLoader>
        </div>
        <Input
          placeholder='0.0'
          suffix={valueIn > 0 ? <TextGrey>${valueIn}</TextGrey> : ''}
          className='fs-24'
          // @ts-ignore
          value={amountIn}
          onChange={(e) => {
            // @ts-ignore
            if (Number(e.target.value) >= 0) {
              setAmountIn((e.target as HTMLInputElement).value)
            }
          }}
        />
      </div>

      <SelectTokenModal
        visible={visibleSelectTokenModal}
        setVisible={setVisibleSelectTokenModal}
        displayFee={tokenTypeToSelect === 'input'}
        tokens={tokensToSelect}
        onSelectToken={onSelectToken}
      />

      {
        outputTokenAddress &&
        <div className='pl-5 mt-1 mb-1'>
          <IconArrowDown fill='#01A7FA' />
        </div>
      }

      {
        outputTokenAddress && <Box
          borderColor='buy'
          className='estimate-box swap-info-box mt-1 mb-1'
        >
          <span className='estimate-box__leverage'>Long {leverage}X</span>
          <InfoRow>
            <span>
              <TokenSymbol token={outputTokenAddress} />:
            </span>
            <span>
              <Text>
                {formatWeiToDisplayNumber(balances[outputTokenAddress], 2, balances[outputTokenAddress].decimal)}
              </Text>
              <Text>+</Text>
              <Text>
                {formatWeiToDisplayNumber(amountOutWei, 2, balances[outputTokenAddress].decimal)}
              </Text>
            </span>
          </InfoRow>
          <InfoRow>
            <span>
              USD:
            </span>
            <span>
              <Text>
                {formatWeiToDisplayNumber(balances[outputTokenAddress], 2, balances[outputTokenAddress].decimal)}
              </Text>
              <Text>+</Text>
              <Text>
                {formatWeiToDisplayNumber(amountOutWei, 2, balances[outputTokenAddress].decimal)}
              </Text>
            </span>
          </InfoRow>
          <InfoRow>
            <span>
              Expiration
            </span>
            <Text>
              0 + 3days
            </Text>
          </InfoRow>
        </Box>
      }
      {
        leverageData.length > 0 &&
        <LeverageSlider
          leverage={leverage}
          setLeverage={setLeverage}
          leverageData={leverageData}
          height={100}
        />
      }

      <Box borderColor='default' className='swap-info-box mt-1 mb-1'>
        <InfoRow>
          <TextGrey>Interest Rate</TextGrey>
          <span>
            {formatFloat(mul(poolToShow?.dailyInterestRate || 0, 100), 3)}%
          </span>
        </InfoRow>
        <InfoRow>
          <TextGrey>Risk Factor</TextGrey>
          <Text>
            {formatFloat(mul(poolToShow?.riskFactor || 0, 100), 3)}%
          </Text>
        </InfoRow>
        <InfoRow>
          <TextGrey>Effective Leverage:</TextGrey>
          <Text>x{poolToShow?.k.toString()}</Text>
        </InfoRow>
      </Box>

      <Box borderColor='default' className='swap-info-box mt-1 mb-1'>
        <InfoRow>
          <TextGrey>Gas Used</TextGrey>
          <span>
            <Text>{formatWeiToDisplayNumber(gasUsed, 0, 0)} Gas</Text>
          </span>
        </InfoRow>
        <InfoRow>
          <TextGrey>Transaction Fee</TextGrey>
          <span>
            <Text>
              {weiToNumber(txFee, 18, 4)}
              <TextGrey> BNB </TextGrey>
              (${weiToNumber(txFee.mul(numberToWei(nativePrice)), 36, 2)})
            </Text>
          </span>
        </InfoRow>
      </Box>

      <div className='actions'>
        {renderExecuteButton()}
      </div>

      <ApproveUtrModal
        callBack={() => {
        }}
        visible={visibleApproveModal}
        setVisible={setVisibleApproveModal}
        inputTokenAddress={inputTokenAddress}
      />
    </div>
  )
}

const InfoRow = (props: any) => {
  return (
    <div
      className={
        'd-flex jc-space-between info-row font-size-12 ' + props.className
      }
    >
      {props.children}
    </div>
  )
}

export const LongBox = React.memo(Component, (prevProps, nextProps) =>
  isEqual(prevProps, nextProps)
)
