import {
  Button,
  Dialog,
  DialogContent,
  DialogTitle,
  InputAdornment,
  TextField,
} from "@material-ui/core";
import SettingsIcon from "@material-ui/icons/Settings";
import { makeStyles } from "@material-ui/styles";
import { useState } from "react";

const useStyles = makeStyles({
  topScrollPaper: {
    alignItems: "flex-start",
  },
  topPaperScrollBody: {
    verticalAlign: "top",
  },
  button: {
    float: "right",
    "&:hover": {
      backgroundColor: "transparent",
    },
  },
});

const clamp = (value: number, min: number, max: number) => {
  if (isNaN(value)) {
    return value;
  }
  return Math.min(Math.max(min, value), max);
};

export default function Settings({
  disabled,
  slippage,
  deadline,
  onSlippageChange,
  onDeadlineChange,
}: {
  disabled: boolean;
  slippage: string;
  deadline: string;
  onSlippageChange: (slippage: string) => void;
  onDeadlineChange: (deadline: string) => void;
}) {
  const classes = useStyles();
  const [dialogIsOpen, setDialogIsOpen] = useState(false);

  const dialog = (
    <Dialog
      open={dialogIsOpen}
      aria-labelledby="simple-dialog-title"
      onClose={() => setDialogIsOpen(false)}
      maxWidth="xs"
      scroll="paper"
    >
      <DialogTitle id="simple-dialog-title">Transaction Settings</DialogTitle>
      <DialogContent>
        <TextField
          variant="outlined"
          label="Slippage tolerance"
          value={slippage}
          fullWidth
          InputProps={{
            endAdornment: <InputAdornment position="end">%</InputAdornment>,
          }}
          margin="normal"
          type="number"
          onChange={(event) => {
            onSlippageChange(
              clamp(parseFloat(event.target.value), 0, 100).toString()
            );
          }}
        ></TextField>
        <TextField
          variant="outlined"
          label="Transaction deadline"
          value={deadline}
          fullWidth
          InputProps={{
            endAdornment: (
              <InputAdornment position="end">minutes</InputAdornment>
            ),
          }}
          margin="normal"
          type="number"
          onChange={(event) => {
            onDeadlineChange(
              clamp(parseFloat(event.target.value), 1, 100).toString()
            );
          }}
        ></TextField>
      </DialogContent>
    </Dialog>
  );

  return (
    <div>
      <Button
        className={classes.button}
        onClick={() => {
          setDialogIsOpen(true);
        }}
        disabled={disabled}
        disableRipple
        endIcon={<SettingsIcon />}
      />
      {dialog}
    </div>
  );
}
