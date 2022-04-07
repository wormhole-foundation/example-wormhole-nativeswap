import { CssBaseline } from "@material-ui/core";
import { ThemeProvider } from "@material-ui/core/styles";
import { SnackbarProvider } from "notistack";
import ReactDOM from "react-dom";
import App from "./App";
import ErrorBoundary from "./components/ErrorBoundary";
import { EthereumProviderProvider } from "./contexts/EthereumProviderContext";
import { SolanaWalletProvider } from "./contexts/SolanaWalletContext";
import { TerraWalletProvider } from "./contexts/TerraWalletContext";
import { theme } from "./muiTheme";

ReactDOM.render(
  <ErrorBoundary>
    <ThemeProvider theme={theme}>
      <CssBaseline>
        <SolanaWalletProvider>
          <EthereumProviderProvider>
            <TerraWalletProvider>
              <SnackbarProvider maxSnack={3}>
                <App />
              </SnackbarProvider>
            </TerraWalletProvider>
          </EthereumProviderProvider>
        </SolanaWalletProvider>
      </CssBaseline>
    </ThemeProvider>
  </ErrorBoundary>,
  document.getElementById("root")
);
