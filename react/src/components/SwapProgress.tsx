import { ChainId, CHAIN_ID_POLYGON, isEVMChain } from "@certusone/wormhole-sdk";
import { LinearProgress, makeStyles, Typography } from "@material-ui/core";
import { useEffect, useState } from "react";
import { useEthereumProvider } from "../contexts/EthereumProviderContext";
import { getChainName } from "../utils/consts";

const useStyles = makeStyles((theme) => ({
  root: {
    marginTop: theme.spacing(2),
    textAlign: "center",
  },
  message: {
    marginTop: theme.spacing(1),
  },
}));

export default function TransactionProgress({
  chainId,
  txBlockNumber,
  hasSignedVAA,
  isTargetSwapComplete,
}: {
  chainId: ChainId;
  txBlockNumber: number | undefined;
  hasSignedVAA: boolean;
  isTargetSwapComplete: boolean;
}) {
  const classes = useStyles();
  const { provider } = useEthereumProvider();
  const [currentBlock, setCurrentBlock] = useState(0);
  useEffect(() => {
    if (hasSignedVAA || !txBlockNumber) return;
    if (isEVMChain(chainId) && provider) {
      let cancelled = false;
      (async () => {
        while (!cancelled) {
          await new Promise((resolve) => setTimeout(resolve, 500));
          try {
            const newBlock = await provider.getBlockNumber();
            if (!cancelled) {
              setCurrentBlock(newBlock);
            }
          } catch (e) {
            console.error(e);
          }
        }
      })();
      return () => {
        cancelled = true;
      };
    }
  }, [hasSignedVAA, chainId, provider, txBlockNumber]);
  let blockDiff =
    txBlockNumber !== undefined && txBlockNumber && currentBlock
      ? currentBlock - txBlockNumber
      : 0;
  const expectedBlocks = chainId === CHAIN_ID_POLYGON ? 512 : 15;
  blockDiff = Math.min(Math.max(blockDiff, 0), expectedBlocks);
  let value;
  let valueBuffer;
  let message;
  if (!hasSignedVAA) {
    value = (blockDiff / expectedBlocks) * 50;
    valueBuffer = 50;
    message = `Waiting for ${blockDiff} / ${expectedBlocks} confirmations on ${getChainName(
      chainId
    )}...`;
  } else if (!isTargetSwapComplete) {
    value = 50;
    valueBuffer = 100;
    message = "Waiting for relayer to complete swap...";
  } else {
    value = 100;
    valueBuffer = 100;
    message = "Success!";
  }
  return (
    <div className={classes.root}>
      <LinearProgress
        variant="buffer"
        value={value}
        valueBuffer={valueBuffer}
      />
      <Typography variant="body2" className={classes.message}>
        {message}
      </Typography>
    </div>
  );
}
