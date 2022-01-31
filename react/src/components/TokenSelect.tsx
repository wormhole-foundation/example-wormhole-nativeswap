import {
  ListItemIcon,
  ListItemText,
  makeStyles,
  MenuItem,
  TextField,
} from "@material-ui/core";
import {
  AVAX_TOKEN_INFO,
  BNB_TOKEN_INFO,
  ETH_TOKEN_INFO,
  MATIC_TOKEN_INFO,
  TokenInfo,
  UST_TOKEN_INFO,
} from "../utils/consts";

import ethIcon from "../icons/eth.svg";
import polygonIcon from "../icons/polygon.svg";
import terraIcon from "../icons/terra.svg";
import bscIcon from "../icons/bsc.svg";
import avaxIcon from "../icons/avax.svg";

const useStyles = makeStyles((theme) => ({
  select: {
    "& .MuiSelect-root": {
      display: "flex",
      alignItems: "center",
    },
  },
  listItemIcon: {
    minWidth: 40,
  },
  icon: {
    height: 24,
    maxWidth: 24,
  },
}));

const getLogo = (name: string) => {
  switch (name) {
    case ETH_TOKEN_INFO.name:
      return ethIcon;
    case MATIC_TOKEN_INFO.name:
      return polygonIcon;
    case UST_TOKEN_INFO.name:
      return terraIcon;
    case AVAX_TOKEN_INFO.name:
      return avaxIcon;
    case BNB_TOKEN_INFO.name:
      return bscIcon;
    default:
      return "";
  }
};

const createTokenMenuItem = ({ name }: TokenInfo, classes: any) => (
  <MenuItem key={name} value={name}>
    <ListItemIcon className={classes.listItemIcon}>
      <img src={getLogo(name)} alt={name} className={classes.icon} />
    </ListItemIcon>
    <ListItemText>{name}</ListItemText>
  </MenuItem>
);

interface TokenSelectProps {
  tokens: TokenInfo[];
  value: string;
  onChange: (event: any) => void;
  disabled: boolean;
}

export default function TokenSelect({
  tokens,
  value,
  onChange,
  disabled,
}: TokenSelectProps) {
  const classes = useStyles();

  return (
    <TextField
      value={value}
      onChange={onChange}
      select
      variant="outlined"
      fullWidth
      className={classes.select}
      disabled={disabled}
    >
      {tokens.map((token) => createTokenMenuItem(token, classes))}
    </TextField>
  );
}
