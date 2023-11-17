import React from 'react'
import { Tabs } from '../ui/Tabs'
import './style.scss'
import { CandleChart } from '../CandleChart'
import { LineChart } from '../LineChart'
import { Text, TextBuy, TextSell } from '../ui/Text'
import { useConfigs } from '../../state/config/useConfigs'
import isEqual from 'react-fast-compare'
import { SelectPoolGroup } from '../SelectPoolGroup'
import { useCurrentPoolGroup } from '../../state/currentPool/hooks/useCurrentPoolGroup'
import { FunctionPlot } from '../FuncPlot'
import { CHART_TABS } from '../../state/currentPool/type'
import { formatFloat, zerofy } from '../../utils/helpers'
import { useCurrentPool } from '../../state/currentPool/hooks/useCurrentPool'
import { useNativePrice } from '../../hooks/useTokenPrice'

const Component = ({ changedIn24h }: { changedIn24h: number }) => {
  const { chainId, configs } = useConfigs()
  const { chartTab, setChartTab, basePrice, id } = useCurrentPoolGroup()
  const { data: nativePrice } = useNativePrice()
  const { currentPool } = useCurrentPool()
  return (
    <div className='chart-box'>
      <div className='chart__head'>
        <div className='chart__head--left'>
          <SelectPoolGroup />
          {!!id && basePrice && (
            <span>
              <Text>
                {[configs.wrappedTokenAddress, ...configs.stablecoins].includes(currentPool.TOKEN_R) ? '$' : '' }
                {zerofy(formatFloat(basePrice) * (currentPool.TOKEN_R === configs.wrappedTokenAddress ? nativePrice : 1))}</Text>
              {changedIn24h > 0 ? (
                <TextBuy>(+{changedIn24h}%)</TextBuy>
              ) : (
                <TextSell>({changedIn24h}%)</TextSell>
              )}
            </span>
          )}
        </div>
        {chainId !== 1337 && (
          <Tabs
            tab={chartTab}
            setTab={setChartTab}
            tabs={[
              { name: 'Candles', value: CHART_TABS.CANDLE_CHART },
              { name: 'Lines', value: CHART_TABS.LINE_CHART },
              { name: 'Curves', value: CHART_TABS.FUNC_PLOT }
            ]}
          />
        )}
      </div>
      {/* {tab === CANDLE_CHART && configs.candleChartApi ? (
        <CandleChart />
      ) : (
        <div />
      )} */}
      <div className='chart-wrap ergawe'>
        {chainId !== 1337 &&
          // @ts-ignore
          (chartTab === CHART_TABS.LINE_CHART && configs.subGraph ? (
            <LineChart changedIn24h={changedIn24h} />
          ) : chartTab === CHART_TABS.FUNC_PLOT ? (
            currentPool?.states && <FunctionPlot />
          ) : (
            <CandleChart />
          ))}
      </div>
    </div>
  )
}

export const Chart = React.memo(Component, (prevProps, nextProps) =>
  isEqual(prevProps, nextProps)
)
