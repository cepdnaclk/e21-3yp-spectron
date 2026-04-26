import React, { useEffect, useState } from 'react';
import { Box, Card, CardContent, Chip, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Typography } from '@mui/material';
import { AdminPairingToken, getAdminPairingTokens } from '../../services/adminService';

const formatDate = (value?: string) => (value ? new Date(value).toLocaleString() : '-');

const AdminPairingTokens: React.FC = () => {
  const [tokens, setTokens] = useState<AdminPairingToken[]>([]);

  useEffect(() => {
    getAdminPairingTokens().then(setTokens).catch(() => setTokens([]));
  }, []);

  return (
    <Box>
      <Typography variant="overline" color="secondary" fontWeight={800}>
        Pairing Tokens
      </Typography>
      <Typography variant="h4" sx={{ mb: 1 }}>QR token lifecycle</Typography>
      <Typography color="text.secondary" sx={{ mb: 3 }}>
        Tokens are temporary setup keys. Used and expired tokens cannot claim controllers again.
      </Typography>

      <Card>
        <CardContent>
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Controller ID</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell>Created</TableCell>
                  <TableCell>Expires</TableCell>
                  <TableCell>Used</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {tokens.map((token, index) => (
                  <TableRow key={`${token.controllerId}-${token.createdAt}-${index}`} hover>
                    <TableCell><Typography fontWeight={800}>{token.controllerId}</Typography></TableCell>
                    <TableCell>
                      <Chip
                        size="small"
                        label={token.status}
                        color={token.status === 'active' ? 'success' : token.status === 'expired' ? 'warning' : 'default'}
                      />
                    </TableCell>
                    <TableCell>{formatDate(token.createdAt)}</TableCell>
                    <TableCell>{formatDate(token.expiresAt)}</TableCell>
                    <TableCell>{formatDate(token.usedAt)}</TableCell>
                  </TableRow>
                ))}
                {tokens.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5}>
                      <Typography align="center" color="text.secondary" sx={{ py: 3 }}>
                        No pairing tokens yet.
                      </Typography>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </CardContent>
      </Card>
    </Box>
  );
};

export default AdminPairingTokens;
