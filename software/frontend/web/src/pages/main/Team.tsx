import React, { useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Grid,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import { GroupAdd, Refresh } from '@mui/icons-material';
import { AccountUser, createViewer, getAccountUsers } from '../../services/authService';

const Team: React.FC = () => {
  const [users, setUsers] = useState<AccountUser[]>([]);
  const [form, setForm] = useState({ name: '', email: '', password: '', phone: '' });
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const loadUsers = async () => {
    setLoading(true);
    setError('');
    try {
      setUsers(await getAccountUsers());
    } catch {
      setError('Only owners can manage viewer accounts.');
      setUsers([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadUsers();
  }, []);

  const handleCreateViewer = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    setNotice('');
    try {
      await createViewer({
        email: form.email,
        password: form.password,
        name: form.name || undefined,
        phone: form.phone || undefined,
      });
      setNotice('Viewer account created. Share these credentials with the viewer.');
      setForm({ name: '', email: '', password: '', phone: '' });
      await loadUsers();
    } catch (err: any) {
      const responseData = err?.response?.data;
      setError(typeof responseData === 'string' ? responseData : 'Failed to create viewer.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Box sx={{ px: { xs: 2, md: 4 }, py: 2 }}>
      <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" spacing={2} sx={{ mb: 3 }}>
        <Box>
          <Typography variant="overline" color="secondary" fontWeight={800}>
            Team
          </Typography>
          <Typography variant="h4" sx={{ mb: 1 }}>
            Viewer accounts
          </Typography>
          <Typography color="text.secondary">
            Owners can create read-only viewer accounts for people in their organization.
          </Typography>
        </Box>
        <Button startIcon={<Refresh />} variant="outlined" onClick={loadUsers} disabled={loading}>
          Refresh
        </Button>
      </Stack>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      {notice && <Alert severity="success" sx={{ mb: 2 }}>{notice}</Alert>}

      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 2 }}>
            <GroupAdd color="secondary" />
            <Typography variant="h6">Add viewer</Typography>
          </Stack>
          <Box component="form" onSubmit={handleCreateViewer}>
            <Grid container spacing={2}>
              <Grid item xs={12} md={6}>
                <TextField fullWidth required label="Viewer email" type="email" placeholder="viewer@example.com" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
              </Grid>
              <Grid item xs={12} md={6}>
                <TextField fullWidth required label="Temporary password" type="password" placeholder="Create a temporary password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
              </Grid>
              <Grid item xs={12} md={6}>
                <TextField fullWidth label="Viewer name" placeholder="Viewer name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </Grid>
              <Grid item xs={12} md={6}>
                <TextField fullWidth label="Phone" placeholder="+94 77 123 4567" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
              </Grid>
              <Grid item xs={12} md={6}>
                <Button type="submit" variant="contained" color="secondary" disabled={saving} fullWidth>
                  Create Viewer
                </Button>
              </Grid>
            </Grid>
          </Box>
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>User</TableCell>
                  <TableCell>Role</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell>Created</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {users.map((user) => (
                  <TableRow key={user.id} hover>
                    <TableCell>
                      <Typography fontWeight={800}>{user.name || user.email}</Typography>
                      <Typography variant="caption" color="text.secondary">{user.email}</Typography>
                    </TableCell>
                    <TableCell><Chip size="small" label={user.role} color={user.role === 'OWNER' ? 'primary' : 'default'} /></TableCell>
                    <TableCell><Chip size="small" label={user.status} color={user.status === 'ACTIVE' ? 'success' : 'default'} /></TableCell>
                    <TableCell>{new Date(user.created_at).toLocaleString()}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </CardContent>
      </Card>
    </Box>
  );
};

export default Team;
