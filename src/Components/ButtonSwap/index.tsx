import { ButtonBuy, ButtonClose, ButtonExecute, ButtonSell } from '../ui/Button'
import {
  bn,
  decodeErc1155Address,
  isErc1155Address,
  mul,
  WEI
} from '../../utils/helpers'
import { toast } from 'react-toastify'
import React, { useEffect, useMemo, useState } from 'react'
import { useListTokens } from '../../state/token/hook'
import { useWeb3React } from '../../state/customWeb3React/hook'
import { useWalletBalance } from '../../state/wallet/hooks/useBalances'
import { useConfigs } from '../../state/config/useConfigs'
import { useSwapHistory } from '../../state/wallet/hooks/useSwapHistory'
import { BigNumber } from 'ethers'
import { CHAINS, POOL_IDS, TRADE_TYPE } from '../../utils/constant'
import { TextSell } from '../ui/Text'
import { useSettings } from '../../state/setting/hooks/useSettings'
import { ApproveUtrModal } from '../ApproveUtrModal'
import { useResource } from '../../state/resources/hooks/useResource'
import { ConfirmPosition } from '../ConfirmPositionModal'
import { useSwapPendingHistory } from '../../state/wallet/hooks/useSwapPendingHistory'

export const ButtonSwap = ({
  inputTokenAddress,
  outputTokenAddress,
  amountIn,
  amountOut,
  callError,
  gasUsed,
  callback,
  tradeType,
  loadingAmountOut,
  payloadAmountIn,
  title,
  payoffRate,
  tokenOutMaturity,
  confirmModal,
  closeConfirmWhenSwap
}: {
  inputTokenAddress: string
  outputTokenAddress: string
  amountIn: string
  amountOut: string
  callError: string
  payloadAmountIn?: BigNumber
  gasUsed: BigNumber
  callback?: any
  loadingAmountOut?: boolean
  tradeType?: TRADE_TYPE
  title: any
  payoffRate?: number
  tokenOutMaturity: BigNumber
  confirmModal?: Boolean
  closeConfirmWhenSwap?: (visible: boolean) => void
}) => {
  const { tokens } = useListTokens()
  const [loading, setLoading] = useState<boolean>(false)
  const [visibleApproveModal, setVisibleApproveModal] = useState<boolean>(false)
  const { account, showConnectModal } = useWeb3React()
  const { balances, fetchBalanceAndAllowance, routerAllowances } =
    useWalletBalance()
  const { ddlEngine } = useConfigs()
  const { settings } = useSettings()
  const { chainId } = useWeb3React()
  const { initResource } = useResource()
  const { swapPendingTxs, updatePendingTxsHandle } = useSwapPendingHistory()
  const slippage = 1 - Math.min(1, payoffRate ?? 0)

  const { updateSwapTxsHandle } = useSwapHistory()
  const [visibleConfirmPosition, setVisibleConfirmPosition] = useState<boolean>(false)
  const sideOut = Number(decodeErc1155Address(outputTokenAddress)?.id ?? 0)

  const ButtonComp =
    sideOut === POOL_IDS.A
      ? ButtonBuy
      : sideOut === POOL_IDS.B
        ? ButtonSell
        : [POOL_IDS.R, POOL_IDS.native].includes(sideOut)
          ? ButtonClose
          : ButtonExecute

  const button = useMemo(() => {
    if (!tokens[inputTokenAddress] || loading) {
      return (
        <ButtonExecute className='swap-button' disabled>
          Loading...
        </ButtonExecute>
      )
    } else if (!account) {
      return (
        <ButtonExecute
          onClick={() => {
            showConnectModal()
          }}
          className='swap-button'
        >
          Connect Wallet
        </ButtonExecute>
      )
    } else if (!Object.values(CHAINS).includes(chainId)) {
      return (
        <ButtonExecute className='swap-button' disabled>
          Unsupported Network
        </ButtonExecute>
      )
    } else if (Number(amountIn) === 0) {
      return (
        <ButtonExecute className='swap-button' disabled>
          Enter Amount
        </ButtonExecute>
      )
    } else if (
      !balances[inputTokenAddress] ||
      balances[inputTokenAddress].lt(
        WEI(amountIn, tokens[inputTokenAddress]?.decimal || 18)
      )
    ) {
      return (
        <ButtonExecute className='swap-button' disabled>
          {' '}
          Insufficient {tokens[inputTokenAddress].symbol} Amount{' '}
        </ButtonExecute>
      )
    } else if (
      !isErc1155Address(inputTokenAddress) &&
      routerAllowances[inputTokenAddress].lt(
        WEI(amountIn, tokens[inputTokenAddress]?.decimal || 18)
      )
    ) {
      return (
        <ButtonExecute
          className='swap-button'
          onClick={() => {
            setVisibleApproveModal(true)
          }}
        >
          Enable EIP-6120
        </ButtonExecute>
      )
    } else if (callError) {
      return (
        <ButtonExecute className='swap-button' disabled>
          {callError}
        </ButtonExecute>
      )
    } else {
      return (
        <ButtonComp
          disabled={slippage > settings.slippageTolerance || loadingAmountOut}
          className='swap-button'
          onClick={async () => {
            if (confirmModal) {
              setVisibleConfirmPosition(true)
              return
            }
            try {
              setLoading(true)
              if (ddlEngine) {
                const amountOutMin = WEI(
                  mul(amountOut, 1 - settings.slippageTolerance),
                tokens[outputTokenAddress]?.decimal || 18
                )
                console.log({
                  amountIn: WEI(
                    amountIn,
                  tokens[inputTokenAddress]?.decimal || 18
                  ),
                  payloadAmountIn: payloadAmountIn?.toString()
                })
                let pendingTxHash: string = ''
                const tx: any = await ddlEngine.SWAP.multiSwap(
                  [
                    {
                      tokenIn: inputTokenAddress,
                      tokenOut: outputTokenAddress,
                      amountIn: bn(
                        WEI(amountIn, tokens[inputTokenAddress]?.decimal || 18)
                      ),
                      amountOutMin,
                      payloadAmountIn,
                      useSweep: !!(
                      tokenOutMaturity?.gt(0) &&
                      balances[outputTokenAddress] &&
                      isErc1155Address(outputTokenAddress)
                      ),
                      currentBalanceOut: balances[outputTokenAddress]
                    }
                  ],
                  gasUsed && gasUsed.gt(0) ? gasUsed.mul(2) : undefined,
                  pendingtx => {
                    pendingTxHash = pendingtx.hash
                    console.log('vinh pending tx:', [...swapPendingTxs, pendingtx])
                    updatePendingTxsHandle([...swapPendingTxs, pendingtx])
                    if (closeConfirmWhenSwap) closeConfirmWhenSwap(false)
                  }
                )

                const swapLogs = ddlEngine.RESOURCE.parseDdlLogs(
                  tx && tx?.logs ? tx.logs : []
                )
                updatePendingTxsHandle(swapPendingTxs.filter(penTx => penTx.hash !== pendingTxHash))
                updateSwapTxsHandle(
                  account,
                  swapLogs.filter(
                    (l: any) => l.transactionHash && l.args?.name === 'Swap'
                  ),
                  swapLogs.filter(
                    (l: any) => l.transactionHash && l.args?.name === 'Transfer'
                  ))
                await fetchBalanceAndAllowance(Object.keys(tokens))
                await initResource(account)
              }
              setLoading(false)
              if (callback) {
                callback()
              }
            } catch (e) {
              console.error(e)
              setLoading(false)
              if (closeConfirmWhenSwap) closeConfirmWhenSwap(false)
              toast.error(String(e.message ?? e))
            }
          }}
        >
          {loadingAmountOut || !amountOut ? 'Calculating...' : title}
        </ButtonComp>
      )
    }
  }, [
    chainId,
    amountOut,
    slippage,
    settings.slippageTolerance,
    ddlEngine,
    loading,
    tokens,
    inputTokenAddress,
    outputTokenAddress,
    loadingAmountOut,
    amountIn,
    callError,
    gasUsed,
    account,
    closeConfirmWhenSwap,
    tokenOutMaturity,
    routerAllowances[inputTokenAddress]
  ])
  useEffect(() => { setLoading(visibleConfirmPosition) }, [visibleConfirmPosition])
  return (
    <React.Fragment>
      {payoffRate &&
      slippage > settings.slippageTolerance &&
      !loadingAmountOut ? (
          <div className='text-center mb-1'>
            <TextSell>High Market Spread and Slippage</TextSell>
          </div>
        ) : (
          ''
        )}
      {button}
      {confirmModal ? <ConfirmPosition
        visible={visibleConfirmPosition}
        setVisible={setVisibleConfirmPosition}
        loadingAmountOut={loadingAmountOut}
        payoffRate={payoffRate}
        inputTokenAddress={inputTokenAddress}
        payloadAmountIn={payloadAmountIn}
        outputTokenAddress={outputTokenAddress}
        amountIn={amountIn}
        amountOut={amountOut}
        tradeType={tradeType}
        callError={callError}
        gasUsed={gasUsed}
        tokenOutMaturity={tokenOutMaturity}
        title={tradeType === TRADE_TYPE.SWAP ? 'Confirm Swap' : undefined}
      /> : ''}
      <ApproveUtrModal
        callBack={() => {}}
        visible={visibleApproveModal}
        setVisible={setVisibleApproveModal}
        inputTokenAddress={inputTokenAddress}
      />
    </React.Fragment>
  )
}
