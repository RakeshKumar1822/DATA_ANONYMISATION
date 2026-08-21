import React, { useState } from 'react';
import { 
  Table, TableBody, TableCell, TableContainer, 
  TableHead, TableRow, Paper, Menu, MenuItem, 
  Select, FormControl, InputLabel, FormControlLabel, Checkbox, Button, Box, TextField, Typography, TablePagination
} from '@mui/material';
import LockIcon from '@mui/icons-material/Lock';
import ArrowDropDownIcon from '@mui/icons-material/ArrowDropDown';
import SearchIcon from '@mui/icons-material/Search';

const ALGOS = [
  "None", "First Name", "Last Name", "Full Name", 
  "Numbers", "Email", "Phone Number", "Alphanumeric", "Date Type", "Bucket-Based"
];

const CASINGS = ["Original Case", "UPPERCASE", "lowercase", "Title Case"];
const DATE_FORMATS = [
  "%d-%m-%Y", "%m-%d-%Y", "%Y-%m-%d",
  "%d/%m/%Y", "%m/%d/%Y", "%Y/%m/%d",
  "%d-%m-%y", "%m-%d-%y", "%d.%m.%Y", "%m.%d.%Y"
];

export default function DataPreviewTable({ 
  columns = [], 
  data = [], 
  rules = {}, 
  totalRows = 0,
  page = 1,
  rowsPerPage = 100, 
  onRowsPerPageChange,
  onPageChange,
  onSaveRule 
}) {
  const [anchorEl, setAnchorEl] = useState(null);
  const [activeCol, setActiveCol] = useState(null);
  const [algoSearchQuery, setAlgoSearchQuery] = useState('');
  const [config, setConfig] = useState({
    algo: "None", case: "Original Case", consistent: true, match_name: false, preserve_format: true, target_date_format: "%d-%m-%Y"
  });

  const handleHeaderClick = (event, col) => {
    setActiveCol(col);
    setAnchorEl(event.currentTarget);
    setAlgoSearchQuery('');
    setConfig(rules[col] || { algo: "None", case: "Original Case", consistent: true, match_name: false, preserve_format: true, target_date_format: "%d-%m-%Y" });
  };

  const handleMenuClose = () => {
    setAnchorEl(null);
    setActiveCol(null);
    setAlgoSearchQuery('');
  };

  const handleApplyConfig = () => {
    if (activeCol) onSaveRule(activeCol, config);
    handleMenuClose();
  };

  const filteredAlgos = ALGOS.filter(a => a.toLowerCase().includes(algoSearchQuery.toLowerCase()));

  const effectiveLimit = rowsPerPage === 'half' ? Math.ceil(totalRows / 2) : Number(rowsPerPage);
  const paginatedData = rowsPerPage >= 500 
    ? data.slice((page - 1) * effectiveLimit, page * effectiveLimit)
    : data.slice(0, effectiveLimit);

  return (
    <Paper className="w-full shadow-sm rounded-md overflow-hidden border border-slate-300 flex flex-col h-full m-0 bg-white">
      {/* Table Container */}
      <TableContainer className="flex-1 min-h-0 overflow-auto">
        <Table stickyHeader size="small" style={{ tableLayout: 'auto' }}>
          <TableHead>
            <TableRow>
              {columns.map((col) => {
                const rule = rules[col] || { algo: 'None' };
                const isConfigured = rule.algo && rule.algo !== 'None';
                return (
                  <TableCell 
                    key={col} 
                    className="bg-slate-100 font-bold text-slate-800 cursor-pointer hover:bg-slate-200 transition-colors px-1.5 py-0.5 text-[7.5px]"
                    style={{ whiteSpace: 'nowrap' }}
                    onClick={(e) => handleHeaderClick(e, col)}
                  >
                    <div className="flex items-center justify-between space-x-1">
                      <span className="truncate">{col}</span>
                      <div className="flex items-center space-x-0.2">
                        {isConfigured && <LockIcon style={{ fontSize: 8 }} className="text-indigo-600" titleAccess={rule.algo} />}
                        <ArrowDropDownIcon style={{ fontSize: 11 }} className="text-slate-600" />
                      </div>
                    </div>
                  </TableCell>
                );
              })}
            </TableRow>
          </TableHead>
          <TableBody>
            {paginatedData.map((row, rIdx) => (
              <TableRow key={rIdx} hover className="even:bg-slate-50/60" style={{ height: '18px' }}>
                {columns.map((col) => (
                  <TableCell 
                    key={col} 
                    className="text-[7px] font-mono text-slate-700 px-1.5 py-0.2" 
                    style={{ whiteSpace: 'nowrap' }}
                  >
                    {row[col] !== null && row[col] !== undefined ? String(row[col]) : <span className="text-slate-300 italic">null</span>}
                  </TableCell>
                ))}
              </TableRow>
            ))}
            {paginatedData.length === 0 && (
              <TableRow>
                <TableCell colSpan={columns.length} className="text-center py-4 text-slate-400 italic text-[9px]">
                  No preview records available.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>

      {/* Bottom Preview Row Selector Toolbar & Pagination */}
      <Box className="flex items-center justify-between px-2 py-1 bg-slate-100 border-t border-slate-300 flex-shrink-0">
        <Typography variant="caption" className="text-[9.2px] font-semibold text-slate-700">
          Showing preview rows (Loaded: {paginatedData.length})
        </Typography>

        <div className="flex items-center space-x-2">
          <span className="text-[9.2px] font-bold text-slate-800">Preview Records:</span>
          <Select
            size="small"
            value={rowsPerPage}
            onChange={(e) => {
              const val = e.target.value;
              if (onRowsPerPageChange) onRowsPerPageChange(val === 'half' ? 'half' : Number(val));
            }}
            style={{ fontSize: '9.2px', height: '20px', backgroundColor: '#FFFFFF' }}
          >
            <MenuItem value={100} style={{ fontSize: '9.2px' }}>100</MenuItem>
            <MenuItem value={150} style={{ fontSize: '9.2px' }}>150</MenuItem>
            <MenuItem value={200} style={{ fontSize: '9.2px' }}>200</MenuItem>
            <MenuItem value={250} style={{ fontSize: '9.2px' }}>250</MenuItem>
            <MenuItem value={500} style={{ fontSize: '9.2px' }}>500</MenuItem>
            <MenuItem value={1000} style={{ fontSize: '9.2px' }}>1000</MenuItem>
            <MenuItem value="half" style={{ fontSize: '9.2px' }}>Half Dataset</MenuItem>
          </Select>

          {Number(rowsPerPage) >= 500 && (
            <TablePagination
              component="div"
              count={totalRows}
              rowsPerPage={typeof rowsPerPage === 'number' ? rowsPerPage : 500}
              page={page - 1}
              onPageChange={(e, newPage) => onPageChange && onPageChange(newPage + 1)}
              rowsPerPageOptions={[]}
              sx={{
                '.MuiToolbar-root': { minHeight: '20px', padding: 0 },
                '.MuiTablePagination-displayedRows': { fontSize: '9px', margin: 0 }
              }}
            />
          )}
        </div>
      </Box>

      {/* Algorithm Config Menu with Integrated Search */}
      <Menu
        anchorEl={anchorEl}
        open={Boolean(anchorEl)}
        onClose={handleMenuClose}
        PaperProps={{ style: { width: '220px', maxHeight: '320px', padding: '6px', fontSize: '9.5px' } }}
      >
        <Box className="px-2 py-1 font-bold text-indigo-700 text-[10px] border-b mb-1.5 flex justify-between items-center">
          <span>Configure: {activeCol}</span>
        </Box>
        <Box className="px-2 space-y-2">
          <FormControl fullWidth size="small">
            <InputLabel shrink style={{ fontSize: '9.5px', background: 'white', padding: '0 3px' }}>Algorithm</InputLabel>
            <Select
              value={config.algo}
              label="Algorithm"
              style={{ fontSize: '9.5px' }}
              onChange={(e) => setConfig({ ...config, algo: e.target.value })}
              onOpen={() => setAlgoSearchQuery('')}
              MenuProps={{
                PaperProps: { style: { maxHeight: 200 } }
              }}
            >
              <Box className="p-1.5 sticky top-0 bg-white z-10 border-b border-slate-200" onClick={(e) => e.stopPropagation()}>
                <TextField
                  size="small"
                  fullWidth
                  placeholder="Type to search algorithm..."
                  value={algoSearchQuery}
                  onChange={(e) => setAlgoSearchQuery(e.target.value)}
                  onKeyDown={(e) => e.stopPropagation()}
                  inputProps={{ style: { fontSize: '9.5px', padding: '3px 5px' } }}
                  InputProps={{
                    startAdornment: <SearchIcon style={{ fontSize: 13, marginRight: 4, color: '#64748B' }} />
                  }}
                />
              </Box>

              {filteredAlgos.map((a) => (
                <MenuItem key={a} value={a} style={{ fontSize: '9.5px' }}>{a}</MenuItem>
              ))}
              {filteredAlgos.length === 0 && (
                <MenuItem disabled style={{ fontSize: '9.5px', fontStyle: 'italic' }}>No algorithm found</MenuItem>
              )}
            </Select>
          </FormControl>

          {["First Name", "Last Name", "Full Name", "Email", "Alphanumeric"].includes(config.algo) && (
            <FormControl fullWidth size="small">
              <InputLabel shrink style={{ fontSize: '9.5px', background: 'white', padding: '0 3px' }}>Casing Structure</InputLabel>
              <Select
                value={config.case}
                label="Casing Structure"
                style={{ fontSize: '9.5px' }}
                onChange={(e) => setConfig({ ...config, case: e.target.value })}
              >
                {CASINGS.map((c) => (
                  <MenuItem key={c} value={c} style={{ fontSize: '9.5px' }}>{c}</MenuItem>
                ))}
              </Select>
            </FormControl>
          )}

          {config.algo === "Date Type" && (
            <FormControl fullWidth size="small">
              <InputLabel shrink style={{ fontSize: '9.5px', background: 'white', padding: '0 3px' }}>Required Output Format</InputLabel>
              <Select
                value={config.target_date_format || "%d-%m-%Y"}
                label="Required Output Format"
                style={{ fontSize: '9.5px' }}
                onChange={(e) => setConfig({ ...config, target_date_format: e.target.value })}
              >
                {DATE_FORMATS.map((fmt) => (
                  <MenuItem key={fmt} value={fmt} style={{ fontSize: '9.5px' }}>{fmt}</MenuItem>
                ))}
              </Select>
            </FormControl>
          )}

          {config.algo !== "None" && (
            <div className="flex flex-col space-y-0.5">
              <FormControlLabel
                control={<Checkbox size="small" checked={config.consistent} onChange={(e) => setConfig({ ...config, consistent: e.target.checked })} />}
                label={<span className="text-[8.5px]">Consistent Lock</span>}
              />
            </div>
          )}

          <div className="flex justify-end space-x-1 pt-1 border-t">
            <Button size="small" onClick={handleMenuClose} style={{ fontSize: '8.5px', minWidth: '40px', padding: '2px 4px' }}>Cancel</Button>
            <Button size="small" variant="contained" onClick={handleApplyConfig} className="bg-indigo-600" style={{ fontSize: '8.5px', minWidth: '40px', padding: '2px 4px' }}>Apply</Button>
          </div>
        </Box>
      </Menu>
    </Paper>
  );
}