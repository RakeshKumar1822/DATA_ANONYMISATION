import React, { useState } from 'react';
import { 
  Table, TableBody, TableCell, TableContainer, 
  TableHead, TableRow, Paper, Menu, MenuItem, 
  Select, FormControl, InputLabel, FormControlLabel, Checkbox, Button, Box, TextField, Typography
} from '@mui/material';
import LockIcon from '@mui/icons-material/Lock';
import ArrowDropDownIcon from '@mui/icons-material/ArrowDropDown';

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

const DATE_FORMATS = [
  "%d-%m-%Y", "%m-%d-%Y", "%Y-%m-%d",
  "%d/%m/%Y", "%m/%d/%Y", "%Y/%m/%d",
  "%d-%m-%y", "%m-%d-%y",
  "%d.%m.%Y", "%m.%d.%Y",
  "%b-%d-%Y", "%b/%d/%Y", "%d-%b-%Y"
];

export default function DataPreviewTable({ 
  columns = [], 
  data = [], 
  rules = {}, 
  rowsPerPage = 100, 
  onRowsPerPageChange,
  onSaveRule 
}) {
  const [anchorEl, setAnchorEl] = useState(null);
  const [activeCol, setActiveCol] = useState(null);
  const [algoSearchQuery, setAlgoSearchQuery] = useState('');
  const [config, setConfig] = useState({
    algo: "None",
    case: "Original Case",
    consistent: true,
    match_name: false,
    preserve_format: true,
    target_date_format: "%d-%m-%Y"
  });

  const handleHeaderClick = (event, col) => {
    setActiveCol(col);
    setAnchorEl(event.currentTarget);
    setAlgoSearchQuery('');
    const existingRule = rules[col] || {
      algo: "None",
      case: "Original Case",
      consistent: true,
      match_name: false,
      preserve_format: true,
      target_date_format: "%d-%m-%Y"
    };
    setConfig(existingRule);
  };

  const handleMenuClose = () => {
    setAnchorEl(null);
    setActiveCol(null);
    setAlgoSearchQuery('');
  };

  const handleApplyConfig = () => {
    if (activeCol) {
      onSaveRule(activeCol, config);
    }
    handleMenuClose();
  };

  const filteredAlgos = ALGOS.filter(algo => 
    algo.toLowerCase().includes(algoSearchQuery.toLowerCase())
  );

  return (
    <Paper className="w-full shadow-sm rounded-md overflow-hidden border border-slate-300 flex flex-col h-full m-0 bg-white">
      {/* Scrollable Data Grid */}
      <TableContainer className="flex-1 min-h-0 overflow-auto">
        <Table stickyHeader size="small">
          <TableHead>
            <TableRow>
              {columns.map((col) => {
                const rule = rules[col] || { algo: 'None' };
                const isConfigured = rule.algo && rule.algo !== 'None';

                return (
                  <TableCell 
                    key={col} 
                    className="bg-slate-100 font-bold text-slate-800 cursor-pointer hover:bg-slate-200 transition-colors px-2 py-1 text-[9.5px]"
                    style={{ whiteSpace: 'nowrap' }}
                    onClick={(e) => handleHeaderClick(e, col)}
                  >
                    <div className="flex items-center justify-between space-x-1">
                      <span className="truncate">{col}</span>
                      <div className="flex items-center space-x-0.5">
                        {isConfigured && (
                          <LockIcon style={{ fontSize: 11 }} className="text-indigo-600" titleAccess={rule.algo} />
                        )}
                        <ArrowDropDownIcon style={{ fontSize: 15 }} className="text-slate-600" />
                      </div>
                    </div>
                  </TableCell>
                );
              })}
            </TableRow>
          </TableHead>
          <TableBody>
            {data.slice(0, rowsPerPage).map((row, rIdx) => (
              <TableRow key={rIdx} hover className="even:bg-slate-50/60">
                {columns.map((col) => (
                  <TableCell key={col} className="text-[8.5px] font-mono text-slate-700 px-2 py-0.5" style={{ whiteSpace: 'nowrap' }}>
                    {row[col] !== null && row[col] !== undefined ? String(row[col]) : <span className="text-slate-300 italic">null</span>}
                  </TableCell>
                ))}
              </TableRow>
            ))}
            {data.length === 0 && (
              <TableRow>
                <TableCell colSpan={columns.length} className="text-center py-4 text-slate-400 italic text-xs">
                  No preview records available.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>

      {/* Bottom Preview Selection Toolbar (Visible & Fully Utilized) */}
      <Box className="flex items-center justify-between px-3 py-1 bg-slate-50 border-t border-slate-200 flex-shrink-0">
        <Typography variant="caption" className="text-[10px] font-semibold text-slate-600">
          Showing preview rows (Total records loaded: {data.length})
        </Typography>
        <div className="flex items-center space-x-2">
          <span className="text-[10px] font-bold text-slate-700">Preview Records:</span>
          <Select
            size="small"
            value={rowsPerPage}
            onChange={(e) => onRowsPerPageChange && onRowsPerPageChange(Number(e.target.value))}
            style={{ fontSize: '10px', height: '24px', backgroundColor: '#FFFFFF' }}
          >
            <MenuItem value={10} style={{ fontSize: '10px' }}>10</MenuItem>
            <MenuItem value={25} style={{ fontSize: '10px' }}>25</MenuItem>
            <MenuItem value={50} style={{ fontSize: '10px' }}>50</MenuItem>
            <MenuItem value={100} style={{ fontSize: '10px' }}>100</MenuItem>
            <MenuItem value={250} style={{ fontSize: '10px' }}>250</MenuItem>
          </Select>
        </div>
      </Box>

      {/* Algorithm Selection Menu */}
      <Menu
        anchorEl={anchorEl}
        open={Boolean(anchorEl)}
        onClose={handleMenuClose}
        PaperProps={{ style: { width: '260px', maxHeight: '380px', padding: '8px', fontSize: '11px' } }}
      >
        <Box className="px-2 py-1 font-bold text-indigo-700 text-xs border-b mb-2 flex justify-between items-center">
          <span>Configure: {activeCol}</span>
        </Box>
        <Box className="px-2 space-y-3">
          <TextField
            size="small"
            fullWidth
            placeholder="Search algorithm..."
            value={algoSearchQuery}
            onChange={(e) => setAlgoSearchQuery(e.target.value)}
            inputProps={{ style: { fontSize: '11px', padding: '4px 6px' } }}
          />

          <FormControl fullWidth size="small">
            <InputLabel shrink style={{ fontSize: '11px', background: 'white', padding: '0 4px' }}>Algorithm</InputLabel>
            <Select
              value={config.algo}
              label="Algorithm"
              style={{ fontSize: '11px' }}
              onChange={(e) => setConfig({ ...config, algo: e.target.value })}
            >
              {filteredAlgos.map((a) => (
                <MenuItem key={a} value={a} style={{ fontSize: '11px' }}>{a}</MenuItem>
              ))}
              {filteredAlgos.length === 0 && (
                <MenuItem disabled style={{ fontSize: '11px', fontStyle: 'italic' }}>No matching algorithm</MenuItem>
              )}
            </Select>
          </FormControl>

          {["First Name", "Last Name", "Full Name", "Email", "Alphanumeric"].includes(config.algo) && (
            <FormControl fullWidth size="small">
              <InputLabel shrink style={{ fontSize: '11px', background: 'white', padding: '0 4px' }}>Casing Structure</InputLabel>
              <Select
                value={config.case}
                label="Casing Structure"
                style={{ fontSize: '11px' }}
                onChange={(e) => setConfig({ ...config, case: e.target.value })}
              >
                {CASINGS.map((c) => (
                  <MenuItem key={c} value={c} style={{ fontSize: '11px' }}>{c}</MenuItem>
                ))}
              </Select>
            </FormControl>
          )}

          {config.algo === "Date Type" && (
            <FormControl fullWidth size="small">
              <InputLabel shrink style={{ fontSize: '11px', background: 'white', padding: '0 4px' }}>Required Output Format</InputLabel>
              <Select
                value={config.target_date_format || "%d-%m-%Y"}
                label="Required Output Format"
                style={{ fontSize: '11px' }}
                onChange={(e) => setConfig({ ...config, target_date_format: e.target.value })}
              >
                {DATE_FORMATS.map((fmt) => (
                  <MenuItem key={fmt} value={fmt} style={{ fontSize: '11px' }}>{fmt}</MenuItem>
                ))}
              </Select>
            </FormControl>
          )}

          {config.algo !== "None" && (
            <div className="flex flex-col space-y-1">
              <FormControlLabel
                control={
                  <Checkbox
                    size="small"
                    checked={config.consistent}
                    onChange={(e) => setConfig({ ...config, consistent: e.target.checked })}
                  />
                }
                label={<span className="text-[10px]">Consistent Lock</span>}
              />
              {config.algo === "Email" && (
                <FormControlLabel
                  control={
                    <Checkbox
                      size="small"
                      checked={config.match_name}
                      onChange={(e) => setConfig({ ...config, match_name: e.target.checked })}
                    />
                  }
                  label={<span className="text-[10px]">Match Names</span>}
                />
              )}
              {config.algo === "Phone Number" && (
                <FormControlLabel
                  control={
                    <Checkbox
                      size="small"
                      checked={config.preserve_format}
                      onChange={(e) => setConfig({ ...config, preserve_format: e.target.checked })}
                    />
                  }
                  label={<span className="text-[10px]">Preserve Format</span>}
                />
              )}
            </div>
          )}

          <div className="flex justify-end space-x-1 pt-1 border-t">
            <Button size="small" onClick={handleMenuClose} style={{ fontSize: '10px' }}>Cancel</Button>
            <Button size="small" variant="contained" onClick={handleApplyConfig} className="bg-indigo-600" style={{ fontSize: '10px' }}>Apply</Button>
          </div>
        </Box>
      </Menu>
    </Paper>
  );
}