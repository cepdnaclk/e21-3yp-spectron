import React, { useEffect, useState } from 'react';
import {
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Divider,
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
import { CheckCircle, PersonAddAlt, Refresh, Block } from '@mui/icons-material';
import {
  AdminOwner,
  approveAdminOwner,
  createAdminOwner,
  getAdminOwners,
  rejectAdminOwner,
} from '../../services/adminService';
import AutoDismissAlert from '../../components/AutoDismissAlert';

const statusColor = (status: AdminOwner['status']) => {
  if (status === 'ACTIVE') return 'success';
  if (status === 'PENDING_APPROVAL') return 'warning';
  if (status === 'REJECTED') return 'error';
  return 'default';
};

const compactButtonSx = {
  minHeight: 36,
  px: 1.5,
  py: 0.5,
  borderRadius: 2,
  transition: 'transform 160ms ease, background-color 160ms ease, border-color 160ms ease',
  '&:hover': {
    transform: 'translateY(-1px)',
  },
  '&:active': {
    transform: 'translateY(0)',
  },
};

const AdminUsers: React.FC = () => {
  const [owners, setOwners] = useState<AdminOwner[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [form, setForm] = useState({
    name: '',
    email: '',
    password: '',
    organizationName: '',
    phone: '',
  });

  const loadOwners = async () => {
    setLoading(true);
    setError('');
    try {
      setOwners(await getAdminOwners());
    } catch {
      setError('Failed to load owner accounts.');
      setOwners([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadOwners();
  }, []);

  const handleCreateOwner = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    setNotice('');
    try {
      await createAdminOwner({
        email: form.email,
        password: form.password,
        name: form.name || undefined,
        phone: form.phone || undefined,
        organizationName: form.organizationName,
      });
      setNotice('Owner account created. You can share these credentials with the owner.');
      setForm({ name: '', email: '', password: '', organizationName: '', phone: '' });
      await loadOwners();
    } catch (err: any) {
      const responseData = err?.response?.data;
      setError(typeof responseData === 'string' ? responseData : 'Failed to create owner account.');
    } finally {
      setSaving(false);
    }
  };

  const updateOwnerStatus = async (owner: AdminOwner, action: 'approve' | 'reject') => {
    setError('');
    setNotice('');
    try {
      if (action === 'approve') {
        await approveAdminOwner(owner.id);
        setNotice(`${owner.email} is now approved.`);
      } else {
        await rejectAdminOwner(owner.id);
        setNotice(`${owner.email} has been rejected.`);
      }
      await loadOwners();
    } catch {
      setError('Failed to update owner status.');
    }
  };

  const pendingCount = owners.filter((owner) => owner.status === 'PENDING_APPROVAL').length;

  return (
    <Box>
      <Stack
        direction={{ xs: 'column', md: 'row' }}
        justifyContent="space-between"
        alignItems={{ xs: 'stretch', md: 'center' }}
        spacing={2}
        sx={{ mb: 3 }}
      >
        <Box>
          <Typography variant="overline" color="secondary" fontWeight={800}>
            Owner Accounts
          </Typography>
          <Typography variant="h4" sx={{ mb: 1 }}>
            Users and approvals
          </Typography>
          <Typography color="text.secondary">
            Approve owner signup requests or create owner credentials directly.
          </Typography>
        </Box>
        <Button
          startIcon={<Refresh />}
          variant="outlined"
          onClick={loadOwners}
          disabled={loading}
          sx={{ ...compactButtonSx, alignSelf: { xs: 'stretch', md: 'center' } }}
        >
          Refresh
        </Button>
      </Stack>

      <AutoDismissAlert open={Boolean(error)} severity="error" sx={{ mb: 2 }} onCloseAlert={() => setError('')}>
        {error}
      </AutoDismissAlert>
      <AutoDismissAlert open={Boolean(notice)} severity="success" sx={{ mb: 2 }} onCloseAlert={() => setNotice('')}>
        {notice}
      </AutoDismissAlert>

      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid item xs={12} md={4}>
          <Card>
            <CardContent>
              <Typography color="text.secondary">Pending approvals</Typography>
              <Typography variant="h4">{pendingCount}</Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} md={4}>
          <Card>
            <CardContent>
              <Typography color="text.secondary">Active owners</Typography>
              <Typography variant="h4">{owners.filter((owner) => owner.status === 'ACTIVE').length}</Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} md={4}>
          <Card>
            <CardContent>
              <Typography color="text.secondary">Viewer accounts</Typography>
              <Typography variant="h4">{owners.reduce((total, owner) => total + owner.viewerCount, 0)}</Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 2 }}>
            <PersonAddAlt color="secondary" />
            <Typography variant="h6">Create owner directly</Typography>
          </Stack>
          <Box component="form" onSubmit={handleCreateOwner}>
            <Grid container spacing={2}>
              <Grid item xs={12} md={6}>
                <TextField fullWidth required label="Owner email" type="email" placeholder="owner@example.com" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
              </Grid>
              <Grid item xs={12} md={6}>
                <TextField fullWidth required label="Temporary password" type="password" placeholder="Create a temporary password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
              </Grid>
              <Grid item xs={12} md={6}>
                <TextField fullWidth label="Owner name" placeholder="Owner name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </Grid>
              <Grid item xs={12} md={6}>
                <TextField fullWidth required label="Organization" placeholder="Organization name" value={form.organizationName} onChange={(e) => setForm({ ...form, organizationName: e.target.value })} />
              </Grid>
              <Grid item xs={12} md={6}>
                <TextField fullWidth label="Phone" placeholder="+94 77 123 4567" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
              </Grid>
              <Grid item xs={12} md={6} sx={{ display: 'flex', alignItems: 'flex-end' }}>
                <Button type="submit" variant="contained" color="secondary" disabled={saving} fullWidth sx={compactButtonSx}>
                  Create Owner
                </Button>
              </Grid>
            </Grid>
          </Box>
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <Typography variant="h6" sx={{ mb: 2 }}>Owner accounts</Typography>
          <Divider sx={{ mb: 2 }} />
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Owner</TableCell>
                  <TableCell>Organization</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell>Controllers</TableCell>
                  <TableCell>Viewers</TableCell>
                  <TableCell>Created</TableCell>
                  <TableCell align="right">Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {owners.map((owner) => (
                  <TableRow key={owner.id} hover>
                    <TableCell>
                      <Typography fontWeight={800}>{owner.name || owner.email}</Typography>
                      <Typography variant="caption" color="text.secondary">{owner.email}</Typography>
                    </TableCell>
                    <TableCell>{owner.organizationName}</TableCell>
                    <TableCell><Chip size="small" label={owner.status} color={statusColor(owner.status) as any} /></TableCell>
                    <TableCell>{owner.controllerCount}</TableCell>
                    <TableCell>{owner.viewerCount}</TableCell>
                    <TableCell>{new Date(owner.createdAt).toLocaleString()}</TableCell>
                    <TableCell align="right">
                      <Stack direction="row" spacing={1} justifyContent="flex-end">
                        {owner.status !== 'ACTIVE' && (
                          <Button size="small" startIcon={<CheckCircle />} onClick={() => updateOwnerStatus(owner, 'approve')} sx={compactButtonSx}>
                            Approve
                          </Button>
                        )}
                        {owner.status === 'PENDING_APPROVAL' && (
                          <Button size="small" color="error" startIcon={<Block />} onClick={() => updateOwnerStatus(owner, 'reject')} sx={compactButtonSx}>
                            Reject
                          </Button>
                        )}
                      </Stack>
                    </TableCell>
                  </TableRow>
                ))}
                {owners.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7}>
                      <Typography color="text.secondary" align="center" sx={{ py: 3 }}>
                        No owner accounts yet.
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

export default AdminUsers;
