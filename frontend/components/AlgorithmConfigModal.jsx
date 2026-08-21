import React from 'react';
import { 
  Dialog, DialogTitle, DialogContent, DialogActions, 
  Button, MenuItem, Select, FormControl, InputLabel, FormControlLabel, Checkbox 
} from '@mui/material';

const ALGOS = [
  "None",
  "First Name",
  "Last Name",
  "Full Name",
  "Numbers",
  "Email",
  "Phone Number",
  "Alphanumeric",
  "Date Type",
  "Bucket-Based"
];

const CASINGS = ["Original Case", "UPPERCASE", "lowercase", "Title Case"];

export default function AlgorithmConfigModal({ open, column, rule, onClose, onSave }) {
  const [config, setConfig] = React.useState(rule || {
    algo: "None",
    case: "Original Case",
    consistent: true,
    match_name: false,
    preserve_format: true
  });

  React.useEffect(() => {
    if (rule) setConfig(rule);
  }, [rule]);

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle className="font-bold text-slate-800">
        Configure Masking: <span className="text-indigo-600">{column}</span>
      </DialogTitle>
      <DialogContent className="flex flex-col space-y-4 pt-2">
        <FormControl fullWidth size="small" className="mt-2">
          <InputLabel>Algorithm</InputLabel>
          <Select
            value={config.algo}
            label="Algorithm"
            onChange={(e) => setConfig({ ...config, algo: e.target.value })}
          >
            {ALGOS.map((a) => (
              <MenuItem key={a} value={a}>{a}</MenuItem>
            ))}
          </Select>
        </FormControl>

        {["First Name", "Last Name", "Full Name", "Email", "Alphanumeric"].includes(config.algo) && (
          <FormControl fullWidth size="small">
            <InputLabel>Casing Structure</InputLabel>
            <Select
              value={config.case}
              label="Casing Structure"
              onChange={(e) => setConfig({ ...config, case: e.target.value })}
            >
              {CASINGS.map((c) => (
                <MenuItem key={c} value={c}>{c}</MenuItem>
              ))}
            </Select>
          </FormControl>
        )}

        {config.algo !== "None" && (
          <div className="flex flex-col space-y-1">
            <FormControlLabel
              control={
                <Checkbox
                  checked={config.consistent}
                  onChange={(e) => setConfig({ ...config, consistent: e.target.checked })}
                />
              }
              label="Consistent Lock (Deterministic)"
            />
            {config.algo === "Email" && (
              <FormControlLabel
                control={
                  <Checkbox
                    checked={config.match_name}
                    onChange={(e) => setConfig({ ...config, match_name: e.target.checked })}
                  />
                }
                label="Match First/Last Names"
              />
            )}
            {config.algo === "Phone Number" && (
              <FormControlLabel
                control={
                  <Checkbox
                    checked={config.preserve_format}
                    onChange={(e) => setConfig({ ...config, preserve_format: e.target.checked })}
                  />
                }
                label="Preserve Original Formatting"
              />
            )}
          </div>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} color="inherit">Cancel</Button>
        <Button onClick={() => { onSave(column, config); onClose(); }} variant="contained" className="bg-indigo-600">
          Apply Rule
        </Button>
      </DialogActions>
    </Dialog>
  );
}