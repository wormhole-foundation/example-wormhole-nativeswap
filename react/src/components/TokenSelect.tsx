import {
  ListItemIcon,
  ListItemText,
  makeStyles,
  MenuItem,
  TextField,
} from "@material-ui/core";
import { TokenInfo } from "../utils/consts";

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

const createTokenMenuItem = ({ name, logo }: TokenInfo, classes: any) => (
  <MenuItem key={name} value={name}>
    <ListItemIcon className={classes.listItemIcon}>
      <img src={logo} alt={name} className={classes.icon} />
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
