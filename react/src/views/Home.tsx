import {
  Container,
  Link,
  makeStyles,
  Paper,
  TextField,
  Typography,
} from "@material-ui/core";
import { ChainId, getSignedVAAWithRetry } from "@certusone/wormhole-sdk";
import { useCallback, useEffect, useState } from "react";
import ButtonWithLoader from "../components/ButtonWithLoader";
import EthereumSignerKey from "../components/EthereumSignerKey";
import TokenSelect from "../components/TokenSelect";
import { useEthereumProvider } from "../contexts/EthereumProviderContext";
import {
  ETH_TOKEN_INFO,
  getEvmChainId,
  MATIC_TOKEN_INFO,
  RELAYER_FEE_UST,
  TOKEN_INFOS,
  WETH_TOKEN_INFO,
  WMATIC_TOKEN_INFO,
  WORMHOLE_RPC_HOSTS,
} from "../utils/consts";
import { COLORS } from "../muiTheme";
import Wormhole from "../icons/wormhole-network.svg";
import { UniswapToUniswapExecutor } from "../swapper/swapper";
import { Web3Provider } from "@ethersproject/providers";
import { hexlify, hexStripZeros } from "ethers/lib/utils";
import { useDebouncedCallback } from "use-debounce";
import { useSnackbar } from "notistack";
import { Alert } from "@material-ui/lab";
import parseError from "../utils/parseError";
import Settings from "../components/Settings";
import getIsTransferCompletedEvmWithRetry from "../utils/getIsTransferCompletedWithRetry";

const useStyles = makeStyles((theme) => ({
  bg: {
    background:
      "linear-gradient(160deg, rgba(69,74,117,.1) 0%, rgba(138,146,178,.1) 33%, rgba(69,74,117,.1) 66%, rgba(98,104,143,.1) 100%), linear-gradient(45deg, rgba(153,69,255,.1) 0%, rgba(121,98,231,.1) 20%, rgba(0,209,140,.1) 100%)",
    display: "flex",
    flexDirection: "column",
    minHeight: "100vh",
  },
  centeredContainer: {
    textAlign: "center",
    width: "100%",
  },
  mainPaper: {
    padding: "2rem",
    backgroundColor: COLORS.nearBlackWithMinorTransparency,
  },
  numberField: {
    flexGrow: 1,
    "& > * > .MuiInputBase-input": {
      textAlign: "center",
      height: "100%",
      flexGrow: "1",
      fontSize: "3rem",
      fontFamily: "Roboto Mono, monospace",
      caretShape: "block",
      "&::-webkit-outer-spin-button, &::-webkit-inner-spin-button": {
        "-webkit-appearance": "none",
        "-moz-appearance": "none",
        margin: 0,
      },
      "&[type=number]": {
        "-webkit-appearance": "textfield",
        "-moz-appearance": "textfield",
      },
    },
    "& > * > input::-webkit-inner-spin-button": {
      webkitAppearance: "none",
      margin: "0",
    },
  },
  gradientButton: {
    backgroundImage: `linear-gradient(45deg, ${COLORS.blue} 0%, ${COLORS.nearBlack}20 50%,  ${COLORS.blue}30 62%, ${COLORS.nearBlack}50  120%)`,
    transition: "0.75s",
    backgroundSize: "200% auto",
    boxShadow: "0 0 20px #222",
    "&:hover": {
      backgroundPosition:
        "right center" /* change the direction of the change here */,
    },
    width: "100%",
    height: "3rem",
    marginTop: "1rem",
  },
  disabled: {
    background: COLORS.gray,
  },
  spacer: {
    height: "1rem",
  },
  titleBar: {
    marginTop: "10rem",
    "& > *": {
      margin: ".5rem",
      alignSelf: "flex-end",
    },
  },
  tokenSelectWrapper: {
    display: "flex",
    alignItems: "center",
  },
  wormholeIcon: {
    height: 60,
    filter: "contrast(0)",
    transition: "filter 0.5s",
    "&:hover": {
      filter: "contrast(1)",
    },
    verticalAlign: "middle",
    margin: "1rem",
    display: "inline-block",
  },
}));

const switchProviderNetwork = async (
  provider: Web3Provider,
  chainId: ChainId
) => {
  const evmChainId = getEvmChainId(chainId);
  if (evmChainId === undefined) {
    throw new Error("Unknown chainId");
  }
  await provider.send("wallet_switchEthereumChain", [
    { chainId: hexStripZeros(hexlify(evmChainId)) },
  ]);
  const network = await provider.getNetwork();
  if (network.chainId !== evmChainId) {
    throw new Error("Could not switch network");
  }
};

export default function Home() {
  const classes = useStyles();
  const [sourceTokenInfo, setSourceTokenInfo] = useState(WMATIC_TOKEN_INFO);
  const [targetTokenInfo, setTargetTokenInfo] = useState(WETH_TOKEN_INFO);
  const [amountIn, setAmountIn] = useState("");
  const [amountOut, setAmountOut] = useState("0.0");
  const [deadline, setDeadline] = useState("30");
  const [slippage, setSlippage] = useState("1");
  const [executor, setExecutor] = useState<UniswapToUniswapExecutor | null>(
    null
  );
  const [isSwapping, setIsSwapping] = useState(false);
  const [isComputingQuote, setIsComputingQuote] = useState(false);
  const [hasQuote, setHasQuote] = useState(false);
  const { provider, signer } = useEthereumProvider();
  const { enqueueSnackbar } = useSnackbar();

  const computeQuote = useCallback(() => {
    (async () => {
      setHasQuote(false);
      setIsComputingQuote(true);
      try {
        if (
          parseFloat(amountIn) > 0 &&
          !isNaN(parseFloat(deadline)) &&
          !isNaN(parseFloat(slippage))
        ) {
          setAmountOut("0.0");
          const executor = new UniswapToUniswapExecutor();
          await executor.initialize(
            sourceTokenInfo.address,
            targetTokenInfo.address,
            sourceTokenInfo.isNative
          );
          await executor.computeAndVerifySrcPoolAddress().catch((e) => {
            throw new Error("failed to verify source pool address");
          });
          await executor.computeAndVerifyDstPoolAddress().catch((e) => {
            throw new Error("failed to verify dest pool address");
          });
          executor.setDeadlines((parseFloat(deadline) * 60).toString());
          executor.setSlippage((parseFloat(slippage) / 100).toString());
          executor.setRelayerFee(RELAYER_FEE_UST);
          const quote = await executor.computeQuoteExactIn(amountIn);
          setExecutor(executor);
          setAmountOut(
            parseFloat(
              executor.tokens.dstOut.formatAmount(quote.dst.minAmountOut)
            ).toFixed(8)
          );
          setHasQuote(true);
        } else {
          setAmountOut("0.0");
        }
      } catch (e) {
        console.error(e);
        enqueueSnackbar(null, {
          content: <Alert severity="error">{parseError(e)}</Alert>,
        });
      }
      setIsComputingQuote(false);
    })();
  }, [
    sourceTokenInfo,
    targetTokenInfo,
    amountIn,
    deadline,
    slippage,
    enqueueSnackbar,
  ]);

  const debouncedComputeQuote = useDebouncedCallback(computeQuote, 1000);

  useEffect(() => {
    debouncedComputeQuote();
  }, [
    sourceTokenInfo,
    targetTokenInfo,
    amountIn,
    deadline,
    slippage,
    debouncedComputeQuote,
  ]);

  const handleAmountChange = useCallback((event) => {
    setAmountIn(event.target.value);
  }, []);

  const handleSlippageChange = useCallback((slippage) => {
    setSlippage(slippage);
  }, []);

  const handleDeadlineChange = useCallback((deadline) => {
    setDeadline(deadline);
  }, []);

  const handleSourceChange = useCallback((event) => {
    // NOTE: only native-to-native or wrapped-to-wrapped swaps are currently supported
    if (event.target.value === WMATIC_TOKEN_INFO.name) {
      setSourceTokenInfo(WMATIC_TOKEN_INFO);
      setTargetTokenInfo(WETH_TOKEN_INFO);
    } else if (event.target.value === WETH_TOKEN_INFO.name) {
      setSourceTokenInfo(WETH_TOKEN_INFO);
      setTargetTokenInfo(WMATIC_TOKEN_INFO);
    } else if (event.target.value === ETH_TOKEN_INFO.name) {
      setSourceTokenInfo(ETH_TOKEN_INFO);
      setTargetTokenInfo(MATIC_TOKEN_INFO);
    } else {
      setSourceTokenInfo(MATIC_TOKEN_INFO);
      setTargetTokenInfo(ETH_TOKEN_INFO);
    }
    setAmountIn("");
    setAmountOut("0.0");
  }, []);

  const handleSwapClick = useCallback(async () => {
    if (provider && signer && executor) {
      try {
        setIsSwapping(true);
        await switchProviderNetwork(provider, sourceTokenInfo.chainId);

        const sourceReceipt = await executor.approveAndSwap(signer);
        console.info(
          "firstSwapTransactionHash:",
          sourceReceipt.transactionHash
        );

        // Wait for the guardian network to reach consensus and emit the signedVAA
        enqueueSnackbar(null, {
          content: <Alert severity="info">Fetching VAA</Alert>,
        });
        const { vaaBytes } = await getSignedVAAWithRetry(
          WORMHOLE_RPC_HOSTS,
          executor.srcExecutionParams.wormhole.chainId,
          executor.vaaSearchParams.emitterAddress,
          executor.vaaSearchParams.sequence
        );
        enqueueSnackbar(null, {
          content: (
            <Alert severity="info">
              Fetched the Signed VAA, waiting for relayer to redeem it
            </Alert>
          ),
        });
        //  Check if the signedVAA has redeemed by the relayer
        const isCompleted = await getIsTransferCompletedEvmWithRetry(
          executor.dstExecutionParams.wormhole.tokenBridgeAddress,
          executor.quoter.dstProvider,
          vaaBytes,
          // retry for two minutes
          3000,
          40
        );
        if (isCompleted) {
          enqueueSnackbar(null, {
            content: <Alert severity="success">Swap completed</Alert>,
          });
        } else {
          // If the relayer hasn't redeemed the signedVAA, then manually redeem it ourselves
          await switchProviderNetwork(provider, targetTokenInfo.chainId);
          const targetReceipt = await executor.fetchVaaAndSwap(signer);
          enqueueSnackbar(null, {
            content: <Alert severity="success">Swap completed</Alert>,
          });
          console.info(
            "secondSwapTransactionHash:",
            targetReceipt.transactionHash
          );
        }
      } catch (e: any) {
        console.error(e);
        enqueueSnackbar(null, {
          content: <Alert severity="error">{parseError(e)}</Alert>,
        });
      }
      setIsSwapping(false);
      setAmountIn("");
    }
  }, [
    provider,
    signer,
    executor,
    enqueueSnackbar,
    sourceTokenInfo,
    targetTokenInfo,
  ]);

  const readyToSwap = provider && signer && hasQuote;

  return (
    <div className={classes.bg}>
      <Container className={classes.centeredContainer} maxWidth="sm">
        <div className={classes.titleBar}></div>
        <Typography variant="h4" color="textSecondary">
          Cross Chain Swap Demo
        </Typography>
        <div className={classes.spacer} />
        <Paper className={classes.mainPaper}>
          <Settings
            disabled={isSwapping || isComputingQuote}
            slippage={slippage}
            deadline={deadline}
            onSlippageChange={handleSlippageChange}
            onDeadlineChange={handleDeadlineChange}
          />
          <TokenSelect
            tokens={TOKEN_INFOS}
            value={sourceTokenInfo.name}
            onChange={handleSourceChange}
            disabled={isSwapping || isComputingQuote}
          ></TokenSelect>
          <Typography variant="subtitle1">Send</Typography>
          <TextField
            type="number"
            value={amountIn}
            disabled={isSwapping || isComputingQuote}
            InputProps={{ disableUnderline: true }}
            className={classes.numberField}
            onChange={handleAmountChange}
            placeholder="0.0"
          ></TextField>
          <div className={classes.spacer} />
          <TokenSelect
            tokens={TOKEN_INFOS}
            value={targetTokenInfo.name}
            onChange={() => {}}
            disabled={true}
          ></TokenSelect>
          <Typography variant="subtitle1">Receive (estimated)</Typography>
          <TextField
            type="number"
            value={amountOut}
            autoFocus={true}
            InputProps={{ disableUnderline: true }}
            className={classes.numberField}
            inputProps={{ readOnly: true }}
          ></TextField>
          <Typography variant="subtitle2">{`Slippage tolerance: ${slippage}%`}</Typography>
          {!isSwapping && <EthereumSignerKey />}
          <ButtonWithLoader
            disabled={!readyToSwap || isSwapping}
            showLoader={isSwapping}
            onClick={handleSwapClick}
          >
            Swap
          </ButtonWithLoader>
          <div className={classes.spacer} />
          <Typography variant="subtitle2" color="error">
            WARNING: this is a Testnet release only
          </Typography>
        </Paper>
        <div className={classes.spacer} />
        <Typography variant="subtitle1" color="textSecondary">
          {"powered by wormhole"}
        </Typography>
        <img src={Wormhole} alt="Wormhole" className={classes.wormholeIcon} />
        <div className={classes.spacer} />
        <Link variant="subtitle2" href="https://goerli-faucet.slock.it/">
          Goerli faucet
        </Link>
        <div />
        <Link href="https://faucet.polygon.technology/">Mumbai faucet</Link>
      </Container>
    </div>
  );
}
