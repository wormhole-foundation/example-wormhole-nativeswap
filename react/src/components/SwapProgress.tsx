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
  step,
}: {
  chainId: ChainId;
  txBlockNumber: number | undefined;
  step: number;
}) {
  const classes = useStyles();
  const { provider } = useEthereumProvider();
  const [currentBlock, setCurrentBlock] = useState(0);
  useEffect(() => {
    if (step !== 1 || !txBlockNumber) return;
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
  }, [step, chainId, provider, txBlockNumber]);
  const blockDiff =
    txBlockNumber !== undefined && txBlockNumber && currentBlock
      ? currentBlock - txBlockNumber
      : 0;
  const expectedBlocks = 15;
  let value;
  let valueBuffer;
  let message;
  switch (step) {
    case 1:
      value = (blockDiff / expectedBlocks) * 50;
      valueBuffer = 50;
      message = `Waiting for ${blockDiff} / ${expectedBlocks} confirmations on ${
        chainId === CHAIN_ID_POLYGON ? "Polygon" : "Ethereum"
      }...`;
      break;
    case 2:
      value = 50;
      valueBuffer = 100;
      message = "Waiting for relayer to complete swap...";
      break;
    case 3:
      value = 100;
      valueBuffer = 100;
      message = "";
      break;
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
