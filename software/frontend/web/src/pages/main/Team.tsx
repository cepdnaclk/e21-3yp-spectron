import React, { useEffect, useState } from 'react';
import {
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Grid,
  IconButton,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import { DeleteOutline, GroupAdd, Refresh } from '@mui/icons-material';
import { AccountUser, createViewer, deleteViewer, getAccountUsers } from '../../services/authService';
import AutoDismissAlert from '../../components/AutoDismissAlert';

const LOCAL_VIEWERS_KEY = 'spectron-created-viewers';

const userIdentity = (user: AccountUser) => user.id || user.email.toLowerCase();

const usersMatch = (left: AccountUser, right: AccountUser) => {
  return (
    (Boolean(left.id) && Boolean(right.id) && left.id === right.id) ||
    left.email.toLowerCase() === right.email.toLowerCase()
  );
};

const mergeUsers = (...groups: AccountUser[][]): AccountUser[] => {
  const usersByIdentity = new Map<string, AccountUser>();

  groups.flat().forEach((user) => {
    const identity = userIdentity(user);
    if (!usersByIdentity.has(identity)) {
      usersByIdentity.set(identity, user);
    }
  });

  return Array.from(usersByIdentity.values());
};

const readStoredViewers = (): AccountUser[] => {
  try {
    const stored = localStorage.getItem(LOCAL_VIEWERS_KEY);
    const parsed = stored ? JSON.parse(stored) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const writeStoredViewers = (viewers: AccountUser[]) => {
  try {
    localStorage.setItem(LOCAL_VIEWERS_KEY, JSON.stringify(viewers.filter((user) => user.role === 'VIEWER')));
  } catch {
    // Ignore local fallback cache failures; the backend remains the source of truth.
  }
};

const rememberCreatedViewer = (viewer: AccountUser) => {
  writeStoredViewers(mergeUsers([viewer], readStoredViewers()));
};

const forgetStoredViewer = (viewer: AccountUser) => {
  writeStoredViewers(readStoredViewers().filter((storedViewer) => !usersMatch(storedViewer, viewer)));
};

const Team: React.FC = () => {
  const [users, setUsers] = useState<AccountUser[]>([]);
  const [form, setForm] = useState({ name: '', email: '', password: '', phone: '' });
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [removingViewerId, setRemovingViewerId] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const loadUsers = async (options?: { preserveExisting?: boolean }) => {
    setLoading(true);
    setError('');
    try {
      const accountUsers = await getAccountUsers();
      setUsers((current) => mergeUsers(
        accountUsers,
        readStoredViewers(),
        options?.preserveExisting ? current : []
      ));
    } catch {
      setError('Only owners can manage viewer accounts.');
      setUsers((current) => (
        options?.preserveExisting ? mergeUsers(current, readStoredViewers()) : readStoredViewers()
      ));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadUsers();
  }, []);

  const upsertViewer = (viewer: AccountUser) => {
    setUsers((current) => {
      const withoutViewer = current.filter((user) => !usersMatch(user, viewer));
      return [viewer, ...withoutViewer];
    });
  };

  const removeViewerFromTable = (viewer: AccountUser) => {
    setUsers((current) => current.filter((user) => !usersMatch(user, viewer)));
  };

  const handleCreateViewer = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const createdViewer = await createViewer({
        email: form.email,
        password: form.password,
        name: form.name || undefined,
        phone: form.phone || undefined,
      });
      const viewerRow: AccountUser = {
        id: createdViewer.id,
        email: createdViewer.email,
        name: createdViewer.name,
        phone: createdViewer.phone,
        role: 'VIEWER',
        status: createdViewer.status || 'ACTIVE',
        created_at: new Date().toISOString(),
      };
      rememberCreatedViewer(viewerRow);
      upsertViewer(viewerRow);
      setNotice('Viewer account created. Share these credentials with the viewer.');
      setForm({ name: '', email: '', password: '', phone: '' });
      await loadUsers({ preserveExisting: true });
    } catch (err: any) {
      const responseData = err?.response?.data;
      setError(typeof responseData === 'string' ? responseData : 'Failed to create viewer.');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteViewer = async (viewer: AccountUser) => {
    setRemovingViewerId(userIdentity(viewer));
    setError('');
    setNotice('');
    try {
      await deleteViewer(viewer.id);
      forgetStoredViewer(viewer);
      removeViewerFromTable(viewer);
      setNotice('Viewer account removed.');
    } catch (err: any) {
      const responseData = err?.response?.data;
      setError(typeof responseData === 'string' ? responseData : 'Failed to remove viewer.');
    } finally {
      setRemovingViewerId('');
    }
  };

  const viewerUsers = users.filter((user) => user.role === 'VIEWER');

  return (
    <Box sx={{ px: { xs: 1.75, md: 4 }, py: { xs: 1.5, md: 2 } }}>
      <Stack
        direction={{ xs: 'column', sm: 'row' }}
        justifyContent="space-between"
        alignItems={{ xs: 'flex-start', sm: 'center' }}
        spacing={2}
        sx={{ mb: 3 }}
      >
        <Box>
          <Typography variant="overline" color="secondary" fontWeight={800}>
            Team
          </Typography>
          <Typography variant="h4" sx={{ mb: 1 }}>
            Viewer accounts
          </Typography>
          <Typography color="text.secondary" sx={{ display: { xs: 'none', sm: 'block' } }}>
            Owners can create read-only viewer accounts for people in their organization.
          </Typography>
        </Box>
        <Button
          startIcon={<Refresh />}
          variant="outlined"
          onClick={() => loadUsers()}
          disabled={loading}
          sx={{
            alignSelf: { xs: 'flex-start', sm: 'center' },
            minHeight: 42,
            px: 2,
            borderRadius: 1.5,
            fontWeight: 800,
            textTransform: 'none',
            bgcolor: 'rgba(255, 255, 255, 0.55)',
            borderColor: 'rgba(104, 137, 47, 0.35)',
            color: 'primary.main',
            '&:hover': {
              bgcolor: 'rgba(104, 137, 47, 0.08)',
              borderColor: 'rgba(104, 137, 47, 0.55)',
            },
          }}
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
          <TableContainer className="mobile-card-table">
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>User</TableCell>
                  <TableCell>Role</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell>Created</TableCell>
                  <TableCell align="right">Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {viewerUsers.map((user) => (
                  <TableRow key={user.id} hover>
                    <TableCell data-label="User">
                      <Typography fontWeight={800}>{user.name || user.email}</Typography>
                      <Typography variant="caption" color="text.secondary">{user.email}</Typography>
                    </TableCell>
                    <TableCell data-label="Role"><Chip size="small" label={user.role} color={user.role === 'OWNER' ? 'primary' : 'default'} /></TableCell>
                    <TableCell data-label="Status"><Chip size="small" label={user.status} color={user.status === 'ACTIVE' ? 'success' : 'default'} /></TableCell>
                    <TableCell data-label="Created">{new Date(user.created_at).toLocaleString()}</TableCell>
                    <TableCell data-label="Actions" align="right">
                      <Tooltip title="Remove viewer">
                        <span>
                          <IconButton
                            aria-label={`Remove viewer ${user.email}`}
                            color="error"
                            disabled={removingViewerId === userIdentity(user)}
                            onClick={() => handleDeleteViewer(user)}
                            size="small"
                          >
                            <DeleteOutline fontSize="small" />
                          </IconButton>
                        </span>
                      </Tooltip>
                    </TableCell>
                  </TableRow>
                ))}
                {!loading && viewerUsers.length === 0 && (
                  <TableRow className="mobile-empty-row">
                    <TableCell colSpan={5}>
                      <Typography color="text.secondary" sx={{ py: 2, textAlign: 'center' }}>
                        No viewer accounts created yet.
                      </Typography>
                    </TableCell>
                  </TableRow>
                )}
                {loading && (
                  <TableRow className="mobile-empty-row">
                    <TableCell colSpan={5}>
                      <Typography color="text.secondary" sx={{ py: 2, textAlign: 'center' }}>
                        Loading viewer accounts...
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

export default Team;
