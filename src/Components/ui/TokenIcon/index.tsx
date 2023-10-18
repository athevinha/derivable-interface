import React, { useEffect, Fragment, useMemo, useState } from 'react'
import { CustomTokenIcon } from '../Icon'
import { useHelper } from '../../../state/config/useHelper'
import {
  decodeErc1155Address,
  getPoolPower,
  isErc1155Address
} from '../../../utils/helpers'
import './style.scss'
import { POOL_IDS } from '../../../utils/constant'
import { useResource } from '../../../state/resources/hooks/useResource'

export const TokenIcon = (props: {
  src?: string
  className?: string
  tokenAddress?: string
  size?: number
}) => {
  const { pools } = useResource()
  const { getTokenIconUrl } = useHelper()
  const [isError, setIsError] = useState<boolean>(!props.src)
  const style = {
    width: props.size || 50,
    height: props.size || 50,
    borderRadius: '50%'
  }

  const onError = () => {
    setIsError(true)
  }

  useEffect(() => {
    setIsError(false)
  }, [props.src])

  const poolToken = useMemo(() => {
    if (
      pools &&
      Object.values(pools).length > 0 &&
      props.tokenAddress &&
      isErc1155Address(props.tokenAddress)
    ) {
      const { id, address } = decodeErc1155Address(props.tokenAddress)
      const pool = pools[address]
      if (!pool) return null
      const power = getPoolPower(pool)
      if (Number(id) === POOL_IDS.C) {
        return (
          <div style={style} className='pool-token-logo pool-token-logo__cp'>
            LP
          </div>
        )
      } else {
        return (
          <div
            style={style}
            className={`pool-token-logo ${
              Number(id) === POOL_IDS.A
                ? 'pool-token-logo__long'
                : 'pool-token-logo__short'
            }`}
          >
            {Number(id) === POOL_IDS.A ? '+' : '-'}
            {power}
          </div>
        )
      }
    } else if (props.tokenAddress?.includes('-' + POOL_IDS.C)) {
      return (
        <div style={style} className='pool-token-logo pool-token-logo__lp'>
          LP
        </div>
      )
    }
    return ''
  }, [pools, props.tokenAddress])
  const src = useMemo(() => {
    if (props.src) return props.src
    if (!props.tokenAddress) return ''
    return getTokenIconUrl(props.tokenAddress)
  }, [props])

  if (poolToken) {
    return <Fragment>{poolToken}</Fragment>
  }

  if (isError || !src) {
    return <CustomTokenIcon size={props.size || 50} {...props} />
  } else {
    return (
      <img
        onError={onError}
        style={{
          width: props.size || 50,
          height: props.size || 50,
          borderRadius: '50%'
        }}
        {...props}
        src={src}
      />
    )
  }
}
