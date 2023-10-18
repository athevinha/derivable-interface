import { BigNumber } from 'ethers'
import _ from 'lodash'
import moment from 'moment'
import React, { useMemo, useState } from 'react'
import { useWindowSize } from '../../hooks/useWindowSize'
import { useConfigs } from '../../state/config/useConfigs'
import { useHelper } from '../../state/config/useHelper'
import { useCurrentPool } from '../../state/currentPool/hooks/useCurrentPool'
import { useCurrentPoolGroup } from '../../state/currentPool/hooks/useCurrentPoolGroup'
import { useResource } from '../../state/resources/hooks/useResource'
import { PoolType } from '../../state/resources/type'
import { useSettings } from '../../state/setting/hooks/useSettings'
import { useListTokens } from '../../state/token/hook'
import { useWalletBalance } from '../../state/wallet/hooks/useBalances'
import { useSwapHistory } from '../../state/wallet/hooks/useSwapHistory'
import {
  MIN_POSITON_VALUE_USD_TO_DISPLAY,
  POOL_IDS,
  POSITION_STATUS,
  TRADE_TYPE,
  ZERO_ADDRESS,
} from '../../utils/constant'
import formatLocalisedCompactNumber, {
  formatWeiToDisplayNumber
} from '../../utils/formatBalance'
import {
  IEW,
  bn,
  decodeErc1155Address,
  div,
  encodeErc1155Address,
  formatFloat,
  formatPercent,
  isErc1155Address,
  mul,
  oracleToPoolGroupId,
  shortenAddressString,
  sub,
  xr,
  zerofy
} from '../../utils/helpers'
import { ClosingFeeCalculator, Position } from '../../utils/type'
import { ClosePosition } from '../ClosePositionModal'
import { useTokenValue } from '../SwapBox/hooks/useTokenValue'
import { ButtonSell } from '../ui/Button'
import { InfoRow } from '../ui/InfoRow'
import {
  Text,
  TextBuy,
  TextError,
  TextLink,
  TextSell,
  TextWarning
} from '../ui/Text'
import { TokenIcon } from '../ui/TokenIcon'
import { TokenSymbol } from '../ui/TokenSymbol'
import './style.scss'
import { useSwapPendingHistory } from '../../state/wallet/hooks/useSwapPendingHistory'
import { SkeletonLoader } from '../ui/SkeletonLoader'

export enum VALUE_IN_USD_STATUS {
  AUTO,
  USD,
  TOKEN_R
}

export const Positions = ({
  setOutputTokenAddressToBuy,
  tokenOutMaturity
}: {
  setOutputTokenAddressToBuy: any
  tokenOutMaturity: BigNumber
}) => {
  const { tradeType, updateCurrentPoolGroup } = useCurrentPoolGroup()
  const { setCurrentPoolAddress } = useCurrentPool()
  const { pools, poolGroups } = useResource()
  const { balances, maturities } = useWalletBalance()
  const { tokens } = useListTokens()
  const { getTokenValue } = useTokenValue({})
  const { wrapToNativeAddress } = useHelper()
  const { settings } = useSettings()
  const [valueInUsdStatus, setValueInUsdStatus] = useState<VALUE_IN_USD_STATUS>(
    VALUE_IN_USD_STATUS.TOKEN_R
  )
  const [visible, setVisible] = useState<boolean>(false)
  const [closingPosition, setClosingPosition] = useState<Position | undefined>(
    undefined
  )
  const [outputTokenAddress, setOutputTokenAddress] = useState<string>('')
  const { ddlEngine } = useConfigs()
  const { swapLogs: sls } = useSwapHistory()
  const { swapPendingTxs } = useSwapPendingHistory()
  const { width } = useWindowSize()
  const isPhone = width && width < 992

  const [now, setNow] = React.useState(Math.floor(new Date().getTime() / 1000))

  // TODO: put this to App, and pass down to each comp
  React.useEffect(() => {
    const timer = setInterval(() => {
      setNow(Math.floor(new Date().getTime() / 1000))
    }, 1000)
    return () => {
      clearInterval(timer)
    }
  }, [])

  const positionsWithEntry = useMemo(() => {
    if (ddlEngine?.HISTORY && Object.values(pools).length > 0) {
      return (
        ddlEngine.HISTORY.generatePositions?.({
          tokens: Object.values(tokens),
          logs: _.cloneDeep(sls)
        }) ?? {}
      )
    }
    return {}
  }, [sls, pools, tokens])

  const generatePositionData = (
    poolAddress: string,
    side: number,
    pendingTxData?: {token: string}
  ): Position | null => {
    const pendingTxPool = decodeErc1155Address(pendingTxData?.token || '')
    const token = encodeErc1155Address(pendingTxData ? pendingTxPool.address : poolAddress, pendingTxData ? Number(pendingTxPool.id) : side)

    if (balances[token]?.gt(0) || pendingTxData?.token) {
      const pool = pools[pendingTxData?.token ? pendingTxPool.address : poolAddress]
      const posWithEntry = positionsWithEntry[token]
      const entryPrice = posWithEntry?.entryPrice
      const entryValue = posWithEntry?.balance?.gt(0)
        ? div(
          mul(balances[token], posWithEntry?.entry ?? 0),
          posWithEntry.balance
        )
        : '0'
      const entryValueR = IEW(
        posWithEntry?.totalEntryR ?? 0,
        tokens[pool.TOKEN_R]?.decimal ?? 18
      )
      const value = getTokenValue(
        token,
        IEW(balances[token], tokens[token]?.decimal || 18),
        false
      )
      const valueUsd = getTokenValue(
        token,
        IEW(balances[token], tokens[token]?.decimal || 18),
        true
      )

      if (Number(valueUsd) < MIN_POSITON_VALUE_USD_TO_DISPLAY && !pendingTxData) {
        return null
      }
      const {
        states: { a, b, R },
        FETCHER,
        MARK,
        baseToken,
        quoteToken,
        sides
      } = pool
      const exp = (!FETCHER || FETCHER == ZERO_ADDRESS) ? 2 : 1
      const k = pool.k.toNumber()
      const ek = sides[side].k
      const effectiveLeverage = Math.min(ek, k) / exp

      const decimalsOffset =
        (tokens?.[baseToken]?.decimal ?? 18) -
        (tokens?.[quoteToken]?.decimal ?? 18)
      const mark = MARK
        ? MARK
          .mul(bn(10).pow(decimalsOffset + 12))
          .shr(128)
          .toNumber() / 1000000000000
        : 1

      const xA = xr(k, R.shr(1), a)
      const xB = xr(-k, R.shr(1), b)
      const dgA = (xA * mark) ** exp
      const dgB = (xB * mark) ** exp
      const deleveragePrice =
        side === POOL_IDS.A
          ? zerofy(dgA)
          : side === POOL_IDS.B
            ? zerofy(dgB)
            : `${zerofy(dgB)}-${zerofy(dgA)}`

      const sizeDisplay =
        side === POOL_IDS.A || side === POOL_IDS.B
          ? '$' +
            formatLocalisedCompactNumber(
              formatFloat((Number(valueUsd) * k) / 2)
            )
          : ''

      const feeCalculator = new ClosingFeeCalculator({
        MATURITY: pool.MATURITY.toNumber(),
        MATURITY_VEST: pool.MATURITY_VEST.toNumber(),
        MATURITY_RATE: pool.MATURITY_RATE,
        maturity: maturities?.[token]?.toNumber() ?? 0
      })
      let currentPrice = '0'
      Object.keys(poolGroups).map(poolGroupKey => {
        if (poolGroups[poolGroupKey].pools?.[poolAddress]) currentPrice = poolGroups[poolGroupKey].basePrice
      })
      const interest = sides[side].interest
      const premium = sides[side].premium
      const funding = interest + premium

      return {
        poolAddress,
        currentPrice,
        pool,
        token,
        side,
        balance: balances[token],
        entryValueR,
        entryValue,
        entryPrice,
        sizeDisplay,
        value,
        valueUsd,
        leverage: k / 2,
        effectiveLeverage,
        deleveragePrice,
        funding,
        closingFee: (now?: number): any => {
          return feeCalculator.calculateFee(now)
        },
        status: POSITION_STATUS.OPENED
      }
    }
    return null
  }
  const generatePositionFromInput = (token: string): any => {
    if (!isErc1155Address(token)) return null
    const { address, id } = decodeErc1155Address(token)
    const s1 = { ...generatePositionData(address, Number(id), { token: token }), status: POSITION_STATUS.OPENING }
    return s1
  }
  const positions: Position[] = useMemo(() => {
    const result: any = []
    Object.keys(pools).forEach((poolAddress) => {
      result.push(generatePositionData(poolAddress, POOL_IDS.A))
      result.push(generatePositionData(poolAddress, POOL_IDS.B))
      result.push(generatePositionData(poolAddress, POOL_IDS.C))
    })

    return result.filter((r: any) => r !== null)
  }, [positionsWithEntry, balances, maturities, pools])

  const [displayPositions, hasClosingFee] = useMemo(() => {
    let displayPositions: Position[] = []
    if (positions && positions.length > 0) {
      displayPositions = positions.filter((p) => {
        if (tradeType === TRADE_TYPE.LIQUIDITY) {
          return p.side === POOL_IDS.C
        }
        if (tradeType === TRADE_TYPE.LONG || tradeType === TRADE_TYPE.SHORT) {
          return p.side === POOL_IDS.A || p.side === POOL_IDS.B
        }
        return true
      })
      const pendingPosition = swapPendingTxs.map(swapPendingTx => {
        let isHaveTokenIn = false
        let isHaveTokenOut = false
        const { tokenIn, tokenOut } = swapPendingTx.steps?.[0]
        displayPositions.map((disPos, _) => {
          if (disPos.token === tokenIn) {
            disPos.status = POSITION_STATUS.CLOSING
            isHaveTokenIn = true
          }
          if (disPos.token === tokenOut) {
            disPos.status = POSITION_STATUS.UPDATING
            isHaveTokenOut = true
          }
        })
        if (!isHaveTokenIn && isErc1155Address(tokenIn)) {
          return generatePositionFromInput(tokenIn)
        }
        if (!isHaveTokenOut && isErc1155Address(tokenOut)) {
          return generatePositionFromInput(tokenOut)
        }
        return null
      }).filter(p => p !== null)
      if (pendingPosition) displayPositions = [...pendingPosition, ...displayPositions]
    }

    const hasClosingFee = displayPositions.some(
      (p) => p?.closingFee?.(now)?.fee > 0
    )
    return [displayPositions, hasClosingFee]
  }, [positions, tradeType, swapPendingTxs])

  const showSize = tradeType !== TRADE_TYPE.LIQUIDITY

  return (
    <div className='positions-box'>
      {isPhone ? (
        <div className='positions-list'>
          {displayPositions.map((position, key: number) => {
            return (
              <div className='positions-list__item' key={key}>
                <InfoRow>
                  <Text>Position</Text>
                  <Token token={position.token} />
                </InfoRow>
                {!settings.showBalance || (
                  <InfoRow>
                    <Text>Balance</Text>
                    <Text>
                      {formatWeiToDisplayNumber(
                        position.balance,
                        4,
                        tokens[position.token].decimal
                      )}
                    </Text>
                  </InfoRow>
                )}
                <InfoRow>
                  <Text>Net Value</Text>
                  <NetValue
                    valueInUsdStatus={valueInUsdStatus}
                    valueUsd={position.valueUsd}
                    value={position.value}
                    pool={position.pool}
                    loading={position.status === POSITION_STATUS.OPENING}
                    isPhone
                  />
                </InfoRow>

                {!position.entryValue || (
                  <InfoRow>
                    <Text>
                      PnL
                      <Text
                        className='text-link'
                        onClick={() => {
                          setValueInUsdStatus(
                            valueInUsdStatus === VALUE_IN_USD_STATUS.USD
                              ? VALUE_IN_USD_STATUS.TOKEN_R
                              : VALUE_IN_USD_STATUS.USD
                          )
                        }}
                      >
                        {valueInUsdStatus === VALUE_IN_USD_STATUS.USD
                          ? ` ⇄ ${
                              tokens[wrapToNativeAddress(position.pool.TOKEN_R)]
                                ?.symbol
                            }`
                          : ' ⇄ USD'}
                      </Text>
                    </Text>
                    <Pnl
                      valueInUsdStatus={valueInUsdStatus}
                      position={position}
                      loading={position.status === POSITION_STATUS.OPENING}
                      isPhone
                    />
                  </InfoRow>

                )}
                {!showSize || !position.sizeDisplay || (
                  <InfoRow>
                    <Text>Size</Text>
                    <SkeletonLoader loading={position.status === POSITION_STATUS.OPENING}>
                      {position.effectiveLeverage < position.leverage / 2 ? (
                        <TextError>{position.sizeDisplay}</TextError>
                      ) : position.effectiveLeverage < position.leverage ? (
                        <TextWarning>{position.sizeDisplay}</TextWarning>
                      ) : (
                        <Text>{position.sizeDisplay}</Text>
                      )}
                    </SkeletonLoader>
                  </InfoRow>
                )}
                {!position.entryPrice || (
                  <InfoRow>
                    <Text>Entry Price</Text>
                    <SkeletonLoader loading={position.status === POSITION_STATUS.OPENING}>
                      <Text>{zerofy(formatFloat(position.entryPrice))}</Text>
                    </SkeletonLoader>
                  </InfoRow>
                )}
                <InfoRow>
                  <Text>Deleverage Price</Text>
                  {position.effectiveLeverage < position.leverage / 2 ? (
                    <TextError>{position.deleveragePrice}</TextError>
                  ) : position.effectiveLeverage < position.leverage ? (
                    <TextWarning>{position.deleveragePrice}</TextWarning>
                  ) : (
                    <Text>{position.deleveragePrice}</Text>
                  )}
                </InfoRow>
                <InfoRow>
                  <Text>
                    {position.side === POOL_IDS.C
                      ? 'Funding Yield'
                      : 'Funding Rate'}
                  </Text>
                  <Text
                    className={
                      position.funding < 0 || position.side === POOL_IDS.C
                        ? 'text-green'
                        : 'text-warning'
                    }
                  >
                    {zerofy(formatFloat(position.funding * 100, undefined, 3, true))}%
                  </Text>
                </InfoRow>

                {!position?.closingFee?.(now)?.fee || (
                  <InfoRow>
                    <Text>Closing Fee</Text>
                    <ClosingFee
                      now={now}
                      position={position}
                      isPhone={isPhone}
                    />
                  </InfoRow>
                )}
                {/* <InfoRow>
                  <Text>Reserve</Text>
                  <Reserve pool={position.pool}/>
                </InfoRow> */}
                {/* <InfoRow>
                  <Text>Pool</Text>
                  <ExplorerLink poolAddress={position.poolAddress}/>
                </InfoRow> */}

                <InfoRow>
                  {position.status === POSITION_STATUS.OPENING
                    ? <ButtonSell className='btn-close' size='small' style={{ opacity: 0.5 }} disabled>
                      Pending...
                    </ButtonSell>
                    : <ButtonSell
                      className='btn-close'
                      size='small'
                      onClick={() => {
                        setClosingPosition(position)
                        setOutputTokenAddress(
                          wrapToNativeAddress(position.pool.TOKEN_R)
                        )
                        setVisible(true)
                      }}
                    >
                      {position.side === POOL_IDS.C ? 'Remove' : 'Close'}
                    </ButtonSell>
                  }
                </InfoRow>
              </div>
            )
          })}
        </div>
      ) : (
        <table className='positions-table'>
          <thead>
            <tr>
              <th>Position</th>
              <th className='no-wrap'>
                Net Value
                {positions?.length > 0 && (
                  <Text
                    className='text-link'
                    onClick={() => {
                      setValueInUsdStatus(
                        valueInUsdStatus === VALUE_IN_USD_STATUS.USD
                          ? VALUE_IN_USD_STATUS.TOKEN_R
                          : VALUE_IN_USD_STATUS.USD
                      )
                    }}
                  >
                    {valueInUsdStatus === VALUE_IN_USD_STATUS.USD
                      ? ` ⇄ ${
                          tokens[
                            wrapToNativeAddress(positions?.[0].pool.TOKEN_R)
                          ]?.symbol
                        }`
                      : ' ⇄ USD'}
                  </Text>
                )}
              </th>
              {showSize && <th>Size</th>}
              <th>Entry Price</th>
              <th>Delev. Price</th>
              <th>Funding</th>
              {!hasClosingFee || <th>Closing Fee</th>}
              {/* <th>Reserve</th> */}
              {/* <th>Pool</th> */}
              <th />
            </tr>
          </thead>
          <tbody>
            {displayPositions.map((position, key: number) => {
              return (
                <tr
                  className='position-row'
                  onClick={() => {
                    const pool = pools[position.poolAddress]
                    if (pool?.ORACLE?.length) {
                      updateCurrentPoolGroup(oracleToPoolGroupId(pool.ORACLE))
                    }
                    if (tradeType === TRADE_TYPE.SWAP) {
                      setOutputTokenAddressToBuy(position.token)
                    } else {
                      const { address } = decodeErc1155Address(position.token)
                      const side =
                      tradeType === TRADE_TYPE.LONG ? POOL_IDS.A
                        : tradeType === TRADE_TYPE.SHORT ? POOL_IDS.B
                          : POOL_IDS.C
                      setCurrentPoolAddress(address)
                      setOutputTokenAddressToBuy(
                        encodeErc1155Address(address, side)
                      )
                    }
                  }}
                  key={key}
                >
                  <td>
                    <Token
                      token={position.token}
                      balance={
                        !settings.showBalance
                          ? undefined
                          : formatWeiToDisplayNumber(
                            position.balance,
                            4,
                            tokens[position.token].decimal
                          )
                      }
                    />
                  </td>
                  <td>
                    <div className='net-value-and-pnl'>
                      <NetValue
                        valueInUsdStatus={valueInUsdStatus}
                        valueUsd={position.valueUsd}
                        value={position.value}
                        pool={position.pool}
                        loading={position.status === POSITION_STATUS.OPENING}
                      />
                      <Pnl
                        loading={position.status === POSITION_STATUS.OPENING}
                        valueInUsdStatus={valueInUsdStatus}
                        position={position}
                      />
                    </div>
                  </td>
                  {!showSize || (
                    <td>
                      <SkeletonLoader loading={position.status === POSITION_STATUS.OPENING}>
                        {position.effectiveLeverage < position.leverage / 2 ? (
                          <TextError>{position.sizeDisplay}</TextError>
                        ) : position.effectiveLeverage < position.leverage ? (
                          <TextWarning>{position.sizeDisplay}</TextWarning>
                        ) : (
                          <Text>{position.sizeDisplay}</Text>
                        )}
                      </SkeletonLoader>
                    </td>
                  )}
                  <td>
                    <SkeletonLoader loading={position.status === POSITION_STATUS.OPENING}>
                      {!position.entryPrice || (
                        <Text>{zerofy(formatFloat(position.entryPrice || position.currentPrice))}</Text>
                      )}
                    </SkeletonLoader>
                  </td>
                  <td>
                    {position.effectiveLeverage < position.leverage / 2 ? (
                      <TextError>{position.deleveragePrice}</TextError>
                    ) : position.effectiveLeverage < position.leverage ? (
                      <TextWarning>{position.deleveragePrice}</TextWarning>
                    ) : (
                      <Text>{position.deleveragePrice}</Text>
                    )}
                  </td>
                  <td>
                    <Text
                      className={
                        position.funding < 0 || position.side === POOL_IDS.C
                          ? 'text-green'
                          : 'text-warning'
                      }
                    >
                      {zerofy(formatFloat(position.funding * 100, undefined, 3, true))}%
                    </Text>
                  </td>

                  {!hasClosingFee || (
                    <td>
                      <ClosingFee now={now} position={position} />
                    </td>
                  )}
                  {/* <td><Reserve pool={position.pool}/></td> */}
                  {/* <td><ExplorerLink poolAddress={position.poolAddress}/></td> */}
                  <td className='text-right'>
                    {position.status === POSITION_STATUS.OPENING ? (
                      <ButtonSell disabled size='small' style={{ opacity: 0.5 }}>
                        Pending
                      </ButtonSell>
                    ) : position.status === POSITION_STATUS.CLOSING ? (
                      <ButtonSell
                        size='small'
                        disabled
                        style={{ opacity: 0.5 }}
                      >
                        <SkeletonLoader textLoading={position.side === POOL_IDS.C ? 'Removing' : 'Closing'} loading={position.status === POSITION_STATUS.CLOSING} />
                      </ButtonSell>
                    ) : (
                      <ButtonSell
                        size='small'
                        onClick={(e) => {
                          setClosingPosition(position)
                          setOutputTokenAddress(wrapToNativeAddress(position.pool.TOKEN_R))
                          setVisible(true)
                          e.stopPropagation() // stop the index from being changed
                        }}
                      >
                        {position.side === POOL_IDS.C ? 'Remove' : 'Close'}
                      </ButtonSell>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}
      {visible && closingPosition != null ? (
        <ClosePosition
          visible={visible}
          setVisible={setVisible}
          position={closingPosition}
          outputTokenAddress={outputTokenAddress}
          setOutputTokenAddress={setOutputTokenAddress}
          tokenOutMaturity={tokenOutMaturity}
          valueInUsdStatus={valueInUsdStatus}
          setValueInUsdStatus={setValueInUsdStatus}
          title={
            Number(decodeErc1155Address(closingPosition.token).id) ===
            POOL_IDS.C ? (
                <Text>
                Remove{' '}
                  <TokenSymbol token={closingPosition.token} textWrap={Text} />{' '}
                </Text>
              ) : (
                <Text>
                Close{' '}
                  <TokenSymbol token={closingPosition.token} textWrap={Text} />{' '}
                </Text>
              )
          }
        />
      ) : (
        ''
      )}
    </div>
  )
}

export const NetValue = ({
  value,
  valueUsd,
  pool,
  valueInUsdStatus,
  isPhone,
  loading
}: {
  value: string
  valueUsd: string
  pool: PoolType
  loading?: boolean
  valueInUsdStatus: VALUE_IN_USD_STATUS
  isPhone?: boolean
}) => {
  if (loading) return <SkeletonLoader loading/>
  const valueR = (
    <React.Fragment>
      <TokenIcon tokenAddress={pool?.TOKEN_R} size={16} />
      {formatLocalisedCompactNumber(formatFloat(value))}
    </React.Fragment>
  )
  const valueUSD = '$' + formatLocalisedCompactNumber(formatFloat(valueUsd))
  const valueMain = (
    <React.Fragment>
      {isShowValueInUsd(valueInUsdStatus, pool) ? valueUSD : valueR}
    </React.Fragment>
  )
  const valueSub = isShowValueInUsd(valueInUsdStatus, pool)
    ? ''
    : `(${valueUSD})`
  if (isPhone) {
    return (
      <Text className='d-flex align-item-center'>
        {valueSub}&nbsp;{valueMain}
      </Text>
    )
  }
  return (
    <Text className='d-flex align-item-center'>
      {valueMain}&nbsp;{valueSub}
    </Text>
  )
}

export const Pnl = ({
  position,
  isPhone,
  valueInUsdStatus,
  loading
}: {
  position: Position
  isPhone?: boolean
  loading?:boolean
  valueInUsdStatus: VALUE_IN_USD_STATUS
}) => {
  if (loading) return <SkeletonLoader loading/>
  const [value, entryValue] = isShowValueInUsd(valueInUsdStatus, position?.pool)
    ? [position.valueUsd, position.entryValue]
    : [position.value, position.entryValueR]
  if (!entryValue || !Number(entryValue)) {
    return <React.Fragment />
  }
  const valueChange = sub(value, entryValue)
  const valueChangeDisplay =
    Number(valueChange) >= 0 ? (
      <Text className='d-flex align-item-center'>
        +
        {isShowValueInUsd(valueInUsdStatus, position?.pool) ? (
          '$'
        ) : (
          <TokenIcon tokenAddress={position?.pool?.TOKEN_R} size={16} />
        )}
        {formatLocalisedCompactNumber(formatFloat(valueChange))}
      </Text>
    ) : (
      <Text className='d-flex align-item-center'>
        -
        {isShowValueInUsd(valueInUsdStatus, position?.pool) ? (
          '$'
        ) : (
          <TokenIcon tokenAddress={position?.pool?.TOKEN_R} size={16} />
        )}
        {formatLocalisedCompactNumber(-formatFloat(valueChange))}{' '}
      </Text>
    )
  const pnl = div(valueChange, entryValue)

  if (isPhone) {
    return Number(pnl) >= 0 ? (
      <TextBuy className='pnl'>
        (+{formatPercent(pnl)}%)&nbsp;{valueChangeDisplay}
      </TextBuy>
    ) : (
      <TextSell className='pnl'>
        ({formatPercent(pnl)}%)&nbsp;{valueChangeDisplay}
      </TextSell>
    )
  }
  return Number(pnl) >= 0 ? (
    <TextBuy className='pnl'>
      {valueChangeDisplay}&nbsp;(+{formatPercent(pnl)}%)
    </TextBuy>
  ) : (
    <TextSell className='pnl'>
      {valueChangeDisplay}&nbsp;({formatPercent(pnl)}%)
    </TextSell>
  )
}

export const ClosingFee = ({
  now,
  position,
  isPhone
}: {
  now: number
  position: Position
  isPhone?: boolean
}) => {
  if (!position?.closingFee?.()) return <React.Fragment />
  const res: any = position.closingFee(now)

  if (!res?.fee) {
    return <React.Fragment />
  }

  const TextComp = res?.isVesting ? TextSell : TextWarning
  const feeFormat = formatPercent(Math.min(1, res.fee ?? 0), 2, true)
  const timeFormat = moment.unix(res.remain ?? 0).from(0, true)
  const { status } = position
  if (isPhone) {
    return (
      <div>
        <SkeletonLoader loading={status !== POSITION_STATUS.OPENED} >
          <TextComp>
            {feeFormat}% for {timeFormat}
          </TextComp>
        </SkeletonLoader>
      </div>
    )
  }
  return (
    <div>
      {status !== POSITION_STATUS.UPDATING
        ? <div>
          <SkeletonLoader loading={status === POSITION_STATUS.OPENING} >
            <div>
              <TextComp>{feeFormat}%</TextComp>
            </div>
          </SkeletonLoader>
          <SkeletonLoader loading={status === POSITION_STATUS.OPENING} >
            <div>
              <TextComp>{`for ${timeFormat}`}</TextComp>
            </div>
          </SkeletonLoader>
        </div>
        : <SkeletonLoader height='26px' textLoading='Updating' loading={status === POSITION_STATUS.UPDATING} >
          <TextComp>{`for ${timeFormat}`}</TextComp>
        </SkeletonLoader>
      }
    </div>
  )
}

export const Reserve = ({ pool }: { pool: any }) => {
  const { tokens } = useListTokens()
  const { width } = useWindowSize()
  const isPhone = width && width < 992

  return (
    <div className='d-flex gap-05 align-items-center'>
      <TokenIcon size={isPhone ? 18 : 24} tokenAddress={pool.TOKEN_R} />
      <Text>{tokens[pool.TOKEN_R]?.symbol}</Text>
    </div>
  )
}

export const ExplorerLink = ({ poolAddress }: { poolAddress: string }) => {
  const { configs } = useConfigs()

  return (
    <TextLink href={configs.explorer + '/address/' + poolAddress}>
      {shortenAddressString(poolAddress)}
    </TextLink>
  )
}

export const Token = ({
  token,
  balance
}: {
  token: string
  balance?: string
}) => {
  const { width } = useWindowSize()
  const isPhone = width && width < 992

  return (
    <div className='d-flex gap-05 align-items-center'>
      <TokenIcon size={isPhone ? 18 : 24} tokenAddress={token} />
      <div>
        <div>
          <TokenSymbol token={token} />
        </div>
        {!balance || (
          <div>
            <Text>{balance}</Text>
          </div>
        )}
      </div>
    </div>
  )
}

const isShowValueInUsd = (
  valueInUsdStatus: VALUE_IN_USD_STATUS,
  pool: PoolType
) => {
  return (
    valueInUsdStatus === VALUE_IN_USD_STATUS.USD ||
    (valueInUsdStatus === VALUE_IN_USD_STATUS.AUTO &&
      pool?.baseToken === pool?.TOKEN_R)
  )
}
