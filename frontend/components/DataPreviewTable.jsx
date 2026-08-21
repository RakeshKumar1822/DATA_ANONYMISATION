import React from 'react';
import { 
  Table, TableBody, TableCell, TableContainer, 
  TableHead, TableRow, Paper, Chip, TablePagination 
} from '@mui/material';
import LockIcon from '@mui/icons-material/Lock';

export default function DataPreviewTable({ 
  columns = [], 
  data = [], 
  rules = {}, 
  totalRows = 0, 
  page = 1, 
  rowsPerPage = 50, 
  onPageChange, 
  onColumnConfigClick 
}) {
  return (
    <Paper className="w-full shadow-md rounded-lg overflow-hidden border border-slate-200">
      <TableContainer className="max-h-[calc(100vh-220px)]">
        <Table stickyHeader size="small">
          <TableHead>
            <TableRow>
              {columns.map((col) => {
                const rule = rules[col] || { algo: 'None' };
                const isConfigured = rule.algo !== 'None';

                return (
                  <TableCell 
                    key={col} 
                    className="bg-slate-100 font-bold text-slate-700 cursor-pointer hover:bg-slate-200 transition-colors"
                    onClick={() => onColumnConfigClick && onColumnConfigClick(col)}
                  >
                    <div className="flex items-center justify-between space-x-2">
                      <span className="truncate max-w-[150px]">{col}</span>
                      {isConfigured && (
                        <Chip
                          icon={<LockIcon style={{ fontSize: 12 }} />}
                          label={rule.algo}
                          size="small"
                          color="primary"
                          className="h-5 text-[10px]"
                        />
                      )}
                    </div>
                  </TableCell>
                );
              })}
            </TableRow>
          </TableHead>
          <TableBody>
            {data.map((row, rIdx) => (
              <TableRow key={rIdx} hover className="even:bg-slate-50/50">
                {columns.map((col) => (
                  <TableCell key={col} className="text-xs font-mono text-slate-600">
                    {row[col] !== null && row[col] !== undefined ? String(row[col]) : <span className="text-slate-300 italic">null</span>}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
      <TablePagination
        rowsPerPageOptions={[25, 50, 100]}
        component="div"
        count={totalRows}
        rowsPerPage={rowsPerPage}
        page={page - 1}
        onPageChange={(e, newPage) => onPageChange(newPage + 1)}
      />
    </Paper>
  );
}