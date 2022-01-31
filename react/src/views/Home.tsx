import {
  Collapse,
  Container,
  Link,
  makeStyles,
  Paper,
  TextField,
  Typography,
} from "@material-ui/core";
import {
  ChainId,
  CHAIN_ID_TERRA,
  getSignedVAAWithRetry,
  isEVMChain,
} from "@certusone/wormhole-sdk";
import { useCallback, useEffect, useState } from "react";
import ButtonWithLoader from "../components/ButtonWithLoader";
import EthereumSignerKey from "../components/EthereumSignerKey";
import TokenSelect from "../components/TokenSelect";
import { useEthereumProvider } from "../contexts/EthereumProviderContext";
import {
  ETH_TOKEN_INFO,
  getEvmChainId,
  getSupportedSwaps,
  MATIC_TOKEN_INFO,
  RELAYER_FEE_UST,
  TokenInfo,
  TOKEN_INFOS,
  WORMHOLE_RPC_HOSTS,
} from "../utils/consts";
import { COLORS } from "../muiTheme";
import { UniswapToUniswapExecutor } from "../swapper/swapper";
import { Web3Provider } from "@ethersproject/providers";
import { hexlify, hexStripZeros } from "ethers/lib/utils";
import { useDebouncedCallback } from "use-debounce";
import { useSnackbar } from "notistack";
import { Alert } from "@material-ui/lab";
import parseError from "../utils/parseError";
import Settings from "../components/Settings";
import getIsTransferCompletedEvmWithRetry from "../utils/getIsTransferCompletedWithRetry";
import CircleLoader from "../components/CircleLoader";
import { ArrowForward, CheckCircleOutlineRounded } from "@material-ui/icons";
import SwapProgress from "../components/SwapProgress";
import Footer from "../components/Footer";
import TerraWalletKey from "../components/TerraWalletKey";
import useIsWalletReady from "../hooks/useIsWalletReady";

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
  loaderHolder: {
    display: "flex",
    justifyContent: "center",
    flexDirection: "column",
    alignItems: "center",
  },
  successIcon: {
    color: COLORS.green,
    fontSize: "200px",
  },
  swapPath: {
    display: "inline-flex",
    alignItems: "center",
  },
}));

const switchEvmProviderNetwork = async (
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

const ConnectedWalletAddress = ({
  chainId,
  prefix,
}: {
  chainId: ChainId;
  prefix: string;
}) => {
  const { walletAddress } = useIsWalletReady(chainId, false);
  if (walletAddress) {
    const is0x = walletAddress.startsWith("0x");
    return (
      <Typography variant="subtitle2">
        {prefix} {walletAddress?.substring(0, is0x ? 6 : 3)}...
        {walletAddress?.substring(walletAddress.length - (is0x ? 4 : 3))}
      </Typography>
    );
  }
  return null;
};

const SwapButton = ({
  source,
  target,
  disabled,
  showLoader,
  onClick,
}: {
  source: TokenInfo;
  target: TokenInfo;
  disabled: boolean;
  showLoader: boolean;
  onClick: () => void;
}) => {
  const { isReady: isSourceWalletReady } = useIsWalletReady(
    source.chainId,
    !disabled
  );
  const { isReady: isTargetWalletReady } = useIsWalletReady(
    target.chainId,
    !isEVMChain(source.chainId)
  );

  if (!isSourceWalletReady) {
    return isEVMChain(source.chainId) ? (
      <EthereumSignerKey />
    ) : source.chainId === CHAIN_ID_TERRA ? (
      <TerraWalletKey />
    ) : null;
  }

  if (
    !isTargetWalletReady &&
    (!isEVMChain(source.chainId) || !isEVMChain(target.chainId))
  ) {
    return isEVMChain(target.chainId) ? (
      <EthereumSignerKey />
    ) : source.chainId === CHAIN_ID_TERRA ? (
      <TerraWalletKey />
    ) : null;
  }

  return (
    <ButtonWithLoader
      disabled={disabled}
      showLoader={showLoader}
      onClick={onClick}
    >
      Swap
    </ButtonWithLoader>
  );
};

export default function Home() {
  const classes = useStyles();
  const [sourceTokenInfo, setSourceTokenInfo] = useState(MATIC_TOKEN_INFO);
  const [targetTokenInfo, setTargetTokenInfo] = useState(ETH_TOKEN_INFO);
  const [amountIn, setAmountIn] = useState("");
  const [amountInUST, setAmountInUST] = useState("");
  const [amountOut, setAmountOut] = useState("");
  const [deadline, setDeadline] = useState("30");
  const [slippage, setSlippage] = useState("1");
  const [executor, setExecutor] = useState<UniswapToUniswapExecutor | null>(
    null
  );
  const [isSwapping, setIsSwapping] = useState(false);
  const [isComputingQuote, setIsComputingQuote] = useState(false);
  const [hasQuote, setHasQuote] = useState(false);
  const { provider, signer, signerAddress, disconnect } = useEthereumProvider();
  const { enqueueSnackbar } = useSnackbar();
  const [isSourceSwapComplete, setIsSourceSwapComplete] = useState(false);
  const [isTargetSwapComplete, setIsTargetSwapComplete] = useState(false);
  const [sourceTxBlockNumber, setSourceTxBlockNumber] = useState<
    number | undefined
  >(undefined);
  const [hasSignedVAA, setHasSignedVAA] = useState(false);
  const [relayerTimeoutString, setRelayerTimeoutString] = useState("");

  const computeQuote = useCallback(() => {
    (async () => {
      setHasQuote(false);
      setIsComputingQuote(true);
      setAmountOut("");
      setAmountInUST("");
      try {
        if (
          parseFloat(amountIn) > 0 &&
          !isNaN(parseFloat(deadline)) &&
          !isNaN(parseFloat(slippage))
        ) {
          const executor = new UniswapToUniswapExecutor();
          await executor.initialize(
            sourceTokenInfo.address,
            targetTokenInfo.address,
            true
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
          setAmountOut(parseFloat(quote.minAmountOut).toFixed(8));
          setAmountInUST(parseFloat(quote.ustAmountIn).toFixed(2));
          setHasQuote(true);
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

  const handleSourceChange = useCallback(
    (event) => {
      const tokenInfo = TOKEN_INFOS.find((x) => x.name === event.target.value);
      if (tokenInfo) {
        const supportedSwaps = getSupportedSwaps(tokenInfo);
        if (supportedSwaps) {
          setSourceTokenInfo(tokenInfo);
          if (!supportedSwaps.find((x) => x.name === targetTokenInfo.name)) {
            setTargetTokenInfo(supportedSwaps[0]);
          }
          setAmountIn("");
          setAmountOut("");
        }
      }
    },
    [targetTokenInfo]
  );

  const handleTargetChange = useCallback((event) => {
    const tokenInfo = TOKEN_INFOS.find((x) => x.name === event.target.value);
    if (tokenInfo) {
      setTargetTokenInfo(tokenInfo);
      setAmountOut("");
    }
  }, []);

  const reset = useCallback(() => {
    setIsSwapping(false);
    setHasQuote(false);
    setIsSourceSwapComplete(false);
    setHasSignedVAA(false);
    setIsTargetSwapComplete(false);
    setAmountIn("");
    setAmountOut("");
    setSourceTxBlockNumber(undefined);
    setRelayerTimeoutString("");
    disconnect();
  }, [disconnect]);

  const handleSwapClick = useCallback(async () => {
    if (provider && signer && signerAddress && executor) {
      try {
        setIsSwapping(true);
        setIsSourceSwapComplete(false);
        setHasSignedVAA(false);
        setIsTargetSwapComplete(false);
        setRelayerTimeoutString("");
        await switchEvmProviderNetwork(provider, sourceTokenInfo.chainId);
        console.log(signerAddress);

        const sourceReceipt = await executor.evmApproveAndSwap(
          signer,
          signerAddress
        );
        console.info(
          "firstSwapTransactionHash:",
          sourceReceipt.transactionHash
        );
        setIsSourceSwapComplete(true);
        setSourceTxBlockNumber(sourceReceipt.blockNumber);

        // Wait for the guardian network to reach consensus and emit the signedVAA
        const { vaaBytes } = await getSignedVAAWithRetry(
          WORMHOLE_RPC_HOSTS,
          executor.srcExecutionParams.wormhole.chainId,
          executor.vaaSearchParams.emitterAddress,
          executor.vaaSearchParams.sequence
        );
        setHasSignedVAA(true);
        //  Check if the signedVAA has redeemed by the relayer
        const isCompleted = await getIsTransferCompletedEvmWithRetry(
          executor.dstExecutionParams.wormhole.tokenBridgeAddress,
          // TODO: fix typescript error
          // @ts-ignore
          executor.quoter.getDstEvmProvider(),
          vaaBytes,
          // retry for two minutes
          3000,
          40
        );
        if (!isCompleted) {
          // If the relayer hasn't redeemed the signedVAA, then manually redeem it ourselves
          setRelayerTimeoutString(
            "Timed out waiting for relayer to complete swap. You'll need to complete it yourself."
          );
          await switchEvmProviderNetwork(provider, targetTokenInfo.chainId);
          const targetReceipt = await executor.fetchVaaAndSwap(signer);
          console.info(
            "secondSwapTransactionHash:",
            targetReceipt.transactionHash
          );
        }
        setIsTargetSwapComplete(true);
      } catch (e: any) {
        reset();
        console.error(e);
        enqueueSnackbar(null, {
          content: <Alert severity="error">{parseError(e)}</Alert>,
        });
      }
    }
  }, [
    provider,
    signer,
    signerAddress,
    executor,
    enqueueSnackbar,
    sourceTokenInfo,
    targetTokenInfo,
    reset,
  ]);

  const readyToSwap = provider && signer && hasQuote;
  const disableSelect = isSwapping || isComputingQuote;

  return (
    <div className={classes.bg}>
      <Container className={classes.centeredContainer} maxWidth="sm">
        <div className={classes.titleBar}></div>
        <Typography variant="h4">Wormhole NativeSwap Demo</Typography>
        <div className={classes.spacer} />
        <Paper className={classes.mainPaper}>
          <Collapse in={!isSourceSwapComplete}>
            <Settings
              disabled={disableSelect}
              slippage={slippage}
              deadline={deadline}
              onSlippageChange={handleSlippageChange}
              onDeadlineChange={handleDeadlineChange}
            />
            <TokenSelect
              tokens={TOKEN_INFOS}
              value={sourceTokenInfo.name}
              onChange={handleSourceChange}
              disabled={disableSelect}
            ></TokenSelect>
            <Typography variant="subtitle1">Send</Typography>
            <TextField
              type="number"
              value={amountIn}
              disabled={disableSelect}
              InputProps={{ disableUnderline: true }}
              className={classes.numberField}
              onChange={handleAmountChange}
              placeholder="0.0"
            ></TextField>
            {parseFloat(amountIn) > sourceTokenInfo.maxAmount ? (
              <Typography
                variant="subtitle2"
                color="error"
              >{`The max input amount is ${sourceTokenInfo.maxAmount} ${sourceTokenInfo.name}`}</Typography>
            ) : null}
            <ConnectedWalletAddress
              chainId={sourceTokenInfo.chainId}
              prefix="From:"
            />
            <div className={classes.spacer} />
            <TokenSelect
              tokens={getSupportedSwaps(sourceTokenInfo)}
              value={targetTokenInfo.name}
              onChange={handleTargetChange}
              disabled={disableSelect}
            ></TokenSelect>
            <Typography variant="subtitle1">Receive (estimated)</Typography>
            <TextField
              type="number"
              value={amountOut}
              autoFocus={true}
              InputProps={{ disableUnderline: true }}
              className={classes.numberField}
              inputProps={{ readOnly: true }}
              placeholder="0.0"
            ></TextField>
            <ConnectedWalletAddress
              chainId={
                isEVMChain(sourceTokenInfo.chainId) &&
                isEVMChain(targetTokenInfo.chainId)
                  ? sourceTokenInfo.chainId
                  : targetTokenInfo.chainId
              }
              prefix="To:"
            />
            <div className={classes.spacer} />
            <Typography variant="subtitle2">{`Slippage tolerance: ${slippage}%`}</Typography>
            <Typography variant="subtitle2">{`Relayer fee: ${RELAYER_FEE_UST} UST`}</Typography>
            <SwapButton
              source={sourceTokenInfo}
              target={targetTokenInfo}
              disabled={
                !readyToSwap ||
                isSwapping ||
                parseFloat(amountIn) > sourceTokenInfo.maxAmount
              }
              showLoader={isSwapping}
              onClick={handleSwapClick}
            />
          </Collapse>
          <Collapse in={isSourceSwapComplete && !isTargetSwapComplete}>
            <div className={classes.loaderHolder}>
              <CircleLoader />
              <div className={classes.spacer} />
              <Typography variant="h5">
                {`Your ${sourceTokenInfo.name} is being swapped to ${targetTokenInfo.name}`}
              </Typography>
            </div>
          </Collapse>
          <Collapse in={isTargetSwapComplete}>
            <div className={classes.loaderHolder}>
              <CheckCircleOutlineRounded
                className={classes.successIcon}
                fontSize={"inherit"}
              />
              <Typography>Swap completed!</Typography>
              <ButtonWithLoader onClick={reset}>
                Swap more tokens!
              </ButtonWithLoader>
            </div>
          </Collapse>
          <div className={classes.spacer} />
          {hasQuote && (
            <Typography variant="subtitle1" className={classes.swapPath}>
              {`${amountIn} ${sourceTokenInfo.name}`}
              <ArrowForward fontSize="inherit" style={{ margin: "10px" }} />
              {`${amountInUST} UST `}
              <ArrowForward fontSize="inherit" style={{ margin: "10px" }} />
              {`${amountOut} ${targetTokenInfo.name}`}
            </Typography>
          )}
          {isSourceSwapComplete &&
            !isTargetSwapComplete &&
            !relayerTimeoutString && (
              <>
                <SwapProgress
                  chainId={sourceTokenInfo.chainId}
                  txBlockNumber={sourceTxBlockNumber}
                  hasSignedVAA={hasSignedVAA}
                  isTargetSwapComplete={isTargetSwapComplete}
                />
                <div className={classes.spacer} />
              </>
            )}
          {relayerTimeoutString && (
            <Typography variant="subtitle1">{relayerTimeoutString}</Typography>
          )}
          <Typography variant="subtitle2" color="error">
            WARNING: this is a testnet release only
          </Typography>
        </Paper>
        <div className={classes.spacer} />
        <Footer />
        <Link href="https://goerli-faucet.slock.it/" 
          target="_blank" style={{ margin: "5px" }}>
          Goerli Faucet
        </Link>
        <Link
          href="https://faucet.polygon.technology/"
          target="_blank"
          style={{ margin: "5px" }}
        >
          Mumbai Faucet
        </Link>
        <Link
          href="https://faucet.avax-test.network/"
          target="_blank"
          style={{ margin: "5px" }}
        >
          Fuji Faucet
        </Link>
        <Link
          href="https://testnet.binance.org/faucet-smart/"
          target="_blank"
          style={{ margin: "5px" }}
        >
          BSC Faucet
        </Link>
        <Link
          href="https://github.com/certusone/wormhole-nativeswap-example/"
          target="_blank"
          style={{ margin: "5px" }}
        >
          NativeSwap GitHub
        </Link>
      </Container>
    </div>
  );
}
