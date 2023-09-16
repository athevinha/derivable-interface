import { useConfigs } from '../../config/useConfigs'
import { State } from '../../types'
import { useDispatch, useSelector } from 'react-redux'
import { useEffect } from 'react'
import { addFeeDataWithChain } from '../reducer'
import { JsonRpcProvider } from '@ethersproject/providers'

export const useFeeData = () => {
  const { chainId } = useConfigs()
  const { feeData } = useSelector((state: State) => {
    return {
      feeData: state.resources.feeData
    }
  })
  return {
    feeData: feeData[chainId]
  }
}

export const useFetchFeeData = () => {
  const { configs, chainId } = useConfigs()
  const dispatch = useDispatch()

  useEffect(() => {
    fetchFeeData()
  }, [configs.rpcUrl, chainId])

  const fetchFeeData = () => {
    const provider = new JsonRpcProvider(configs.rpcUrl)
    if (provider) {
      provider.getFeeData().then((feeData: any) => {
        dispatch(
          addFeeDataWithChain({
            feeData,
            chainId
          })
        )
      })
    }
  }
}
