import React, { useEffect, useState } from 'react';
import {
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
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
import { CheckCircle, PersonAddAlt, Refresh, Block, Delete } from '@mui/icons-material';
import {
  AdminOwner,
  approveAdminOwner,
  createAdminOwner,
  deleteAdminOwner,
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
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [ownerToDelete, setOwnerToDelete] = useState<AdminOwner | null>(null);
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
        organizationName: form.organizationName || undefined,
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

  const handleDeleteOwner = (owner: AdminOwner) => {
    setOwnerToDelete(owner);
    setDeleteDialogOpen(true);
  };

  const closeDeleteDialog = () => {
    setDeleteDialogOpen(false);
    setOwnerToDelete(null);
  };

  const confirmDeleteOwner = async () => {
    if (!ownerToDelete) return;
    setError('');
    setNotice('');
    try {
      await deleteAdminOwner(ownerToDelete.id);
      setNotice(`${ownerToDelete.email} has been deleted.`);
      await loadOwners();
    } catch {
      setError('Failed to delete owner account.');
    } finally {
      closeDeleteDialog();
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
          <Typography variant="h4" sx={{ mb: 1 }}>
            Users and approvals
          </Typography>
          <Typography color="text.secondary" sx={{ display: { xs: 'none', sm: 'block' } }}>
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
        <Grid item xs={4}>
          <Card>
            <CardContent>
              <Typography color="text.secondary">Pending approvals</Typography>
              <Typography variant="h4">{pendingCount}</Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={4}>
          <Card>
            <CardContent>
              <Typography color="text.secondary">Active owners</Typography>
              <Typography variant="h4">{owners.filter((owner) => owner.status === 'ACTIVE').length}</Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={4}>
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
                <TextField fullWidth label="Organization" placeholder="Organization name" value={form.organizationName} onChange={(e) => setForm({ ...form, organizationName: e.target.value })} />
              </Grid>
              <Grid item xs={12} md={6}>
                <TextField fullWidth label="Phone" placeholder="+94 77 123 4567" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
              </Grid>
              <Grid item xs={12} sx={{ mt: 1 }}>
                <Button type="submit" variant="contained" color="secondary" disabled={saving} sx={{ ...compactButtonSx, minWidth: 200 }}>
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
          <TableContainer className="mobile-card-table">
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
                    <TableCell data-label="Owner">
                      <Typography fontWeight={800}>{owner.name || owner.email}</Typography>
                      <Typography variant="caption" color="text.secondary">{owner.email}</Typography>
                    </TableCell>
                    <TableCell data-label="Organization">{owner.organizationName}</TableCell>
                    <TableCell data-label="Status"><Chip size="small" label={owner.status} color={statusColor(owner.status) as any} /></TableCell>
                    <TableCell data-label="Controllers">{owner.controllerCount}</TableCell>
                    <TableCell data-label="Viewers">{owner.viewerCount}</TableCell>
                    <TableCell data-label="Created">{new Date(owner.createdAt).toLocaleString()}</TableCell>
                    <TableCell data-label="Actions" align="right">
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
                        <Button size="small" color="error" startIcon={<Delete />} onClick={() => handleDeleteOwner(owner)} sx={compactButtonSx}>
                          Delete
                        </Button>
                      </Stack>
                    </TableCell>
                  </TableRow>
                ))}
                {owners.length === 0 && (
                  <TableRow className="mobile-empty-row">
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

      <Dialog open={deleteDialogOpen} onClose={closeDeleteDialog} fullWidth maxWidth="xs">
        <DialogTitle>Delete Owner Account</DialogTitle>
        <DialogContent>
          <Typography color="text.secondary" sx={{ mb: 2 }}>
            Are you sure you want to permanently delete the owner account for <strong>{ownerToDelete?.email}</strong>?
          </Typography>
          <Typography color="text.secondary" variant="body2">
            This will permanently delete the organization, their associated controllers, sensors, and configurations. This action cannot be undone.
          </Typography>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 3 }}>
          <Button variant="outlined" onClick={closeDeleteDialog}>
            Cancel
          </Button>
          <Button
            variant="contained"
            color="error"
            startIcon={<Delete />}
            onClick={confirmDeleteOwner}
          >
            Delete
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default AdminUsers;
