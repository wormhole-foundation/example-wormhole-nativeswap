import { ChainId, CHAIN_ID_POLYGON, isEVMChain } from "@certusone/wormhole-sdk";
import { LinearProgress, makeStyles, Typography } from "@material-ui/core";
import { useEffect, useState } from "react";
import { useEthereumProvider } from "../contexts/EthereumProviderContext";

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
  isSourceSwapComplete,
  hasSignedVAA,
  isTargetSwapComplete,
}: {
  chainId: ChainId;
  txBlockNumber: number | undefined;
  isSourceSwapComplete: boolean;
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
  const blockDiff =
    txBlockNumber !== undefined && txBlockNumber && currentBlock
      ? currentBlock - txBlockNumber
      : 0;
  const expectedBlocks = 15;
  let value;
  let valueBuffer;
  let message;
  if (!hasSignedVAA) {
    value = (blockDiff / expectedBlocks) * 50;
    valueBuffer = 50;
    message = `Waiting for ${blockDiff} / ${expectedBlocks} confirmations on ${
      chainId === CHAIN_ID_POLYGON ? "Polygon" : "Ethereum"
    }...`;
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
