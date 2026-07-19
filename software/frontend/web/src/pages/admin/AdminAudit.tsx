import React, { useCallback, useEffect, useState } from 'react';
import {
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Collapse,
  FormControl,
  IconButton,
  InputLabel,
  MenuItem,
  Pagination,
  Select,
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
import { ExpandLess, ExpandMore, Refresh, Search } from '@mui/icons-material';
import AutoDismissAlert from '../../components/AutoDismissAlert';
import {
  AdminAuditEvent,
  getAdminAuditEvents,
} from '../../services/adminService';
import { AdminPageShell, adminCardSx, compactAdminButtonSx } from '../../components/admin/AdminSurface';

const PAGE_SIZE = 25;

const actionOptions = [
  'DEVICE_REGISTERED',
  'OWNER_CREATED',
  'OWNER_APPROVED',
  'OWNER_REJECTED',
  'OWNER_STATUS_CHANGED',
  'OWNER_DELETED',
];

const formatAction = (value: string) =>
  value
    .toLowerCase()
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');

const formatDate = (value: string) =>
  new Date(value).toLocaleString([], {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });

const AdminAudit: React.FC = () => {
  const [events, setEvents] = useState<AdminAuditEvent[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [action, setAction] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const loadEvents = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await getAdminAuditEvents({
        limit: PAGE_SIZE,
        offset: (page - 1) * PAGE_SIZE,
        action: action || undefined,
        search: search || undefined,
      });
      setEvents(response.events || []);
      setTotal(response.total || 0);
    } catch {
      setEvents([]);
      setTotal(0);
      setError('Failed to load the audit trail.');
    } finally {
      setLoading(false);
    }
  }, [action, page, search]);

  useEffect(() => {
    loadEvents();
  }, [loadEvents]);

  const applySearch = (event: React.FormEvent) => {
    event.preventDefault();
    setPage(1);
    setSearch(searchInput.trim());
  };

  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <AdminPageShell
      eyebrow="Internal"
      title="Operational audit trail"
      subtitle="Immutable records of successful system-administrator changes."
      actions={(
        <Button startIcon={<Refresh />} variant="outlined" onClick={loadEvents} disabled={loading} sx={compactAdminButtonSx}>
          Refresh
        </Button>
      )}
    >

      <AutoDismissAlert open={Boolean(error)} severity="error" onCloseAlert={() => setError('')} sx={{ mb: 2 }}>
        {error}
      </AutoDismissAlert>

      <Card sx={adminCardSx}>
        <CardContent>
          <Stack
            component="form"
            onSubmit={applySearch}
            direction={{ xs: 'column', md: 'row' }}
            spacing={1.5}
            sx={{ mb: 2 }}
          >
            <TextField
              size="small"
              label="Search actor or target"
              placeholder="eg: admin@example.com"
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              sx={{ flex: 1 }}
            />
            <FormControl size="small" sx={{ minWidth: 220 }}>
              <InputLabel>Action</InputLabel>
              <Select
                value={action}
                label="Action"
                onChange={(event) => {
                  setAction(event.target.value);
                  setPage(1);
                }}
              >
                <MenuItem value="">All actions</MenuItem>
                {actionOptions.map((option) => (
                  <MenuItem key={option} value={option}>
                    {formatAction(option)}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <Button type="submit" variant="contained" startIcon={<Search />} sx={compactAdminButtonSx}>
              Search
            </Button>
          </Stack>

          {loading ? (
            <Stack alignItems="center" sx={{ py: 8 }}>
              <CircularProgress />
            </Stack>
          ) : events.length === 0 ? (
            <Box sx={{ py: 8, textAlign: 'center' }}>
              <Typography variant="h6">No audit events found</Typography>
              <Typography color="text.secondary">
                New administrator changes will appear here automatically.
              </Typography>
            </Box>
          ) : (
            <>
              <TableContainer>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell width={48} />
                      <TableCell>Time</TableCell>
                      <TableCell>Action</TableCell>
                      <TableCell>Administrator</TableCell>
                      <TableCell>Target</TableCell>
                      <TableCell>Source</TableCell>
                      <TableCell>Outcome</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {events.map((event) => {
                      const expanded = expandedId === event.id;
                      return (
                        <React.Fragment key={event.id}>
                          <TableRow hover>
                            <TableCell>
                              <Tooltip title={expanded ? 'Hide details' : 'Show details'}>
                                <IconButton
                                  size="small"
                                  onClick={() => setExpandedId(expanded ? null : event.id)}
                                  aria-label={`${expanded ? 'Hide' : 'Show'} details for ${formatAction(event.action)}`}
                                >
                                  {expanded ? <ExpandLess /> : <ExpandMore />}
                                </IconButton>
                              </Tooltip>
                            </TableCell>
                            <TableCell sx={{ whiteSpace: 'nowrap' }}>{formatDate(event.createdAt)}</TableCell>
                            <TableCell>
                              <Chip size="small" label={formatAction(event.action)} variant="outlined" />
                            </TableCell>
                            <TableCell>{event.actorEmail}</TableCell>
                            <TableCell>
                              <Typography variant="body2">{event.targetLabel || event.targetId || '-'}</Typography>
                              <Typography variant="caption" color="text.secondary">
                                {event.targetType}
                              </Typography>
                            </TableCell>
                            <TableCell>{event.ipAddress || '-'}</TableCell>
                            <TableCell>
                              <Chip
                                size="small"
                                label={event.outcome}
                                color={event.outcome === 'SUCCESS' ? 'success' : 'error'}
                              />
                            </TableCell>
                          </TableRow>
                          <TableRow>
                            <TableCell colSpan={7} sx={{ py: 0, borderBottom: expanded ? undefined : 0 }}>
                              <Collapse in={expanded} timeout="auto" unmountOnExit>
                                <Box sx={{ py: 2 }}>
                                  <Typography variant="subtitle2" sx={{ mb: 1 }}>
                                    Event details
                                  </Typography>
                                  <Box
                                    component="pre"
                                    sx={{
                                      m: 0,
                                      p: 1.5,
                                      borderRadius: 1,
                                      bgcolor: 'action.hover',
                                      fontSize: 12,
                                      whiteSpace: 'pre-wrap',
                                      overflowWrap: 'anywhere',
                                    }}
                                  >
                                    {JSON.stringify(event.details || {}, null, 2)}
                                  </Box>
                                  {event.userAgent && (
                                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
                                      User agent: {event.userAgent}
                                    </Typography>
                                  )}
                                </Box>
                              </Collapse>
                            </TableCell>
                          </TableRow>
                        </React.Fragment>
                      );
                    })}
                  </TableBody>
                </Table>
              </TableContainer>

              <Stack
                direction={{ xs: 'column', sm: 'row' }}
                justifyContent="space-between"
                alignItems="center"
                spacing={1.5}
                sx={{ mt: 2 }}
              >
                <Typography variant="body2" color="text.secondary">
                  {total} event{total === 1 ? '' : 's'}
                </Typography>
                <Pagination
                  count={pageCount}
                  page={Math.min(page, pageCount)}
                  onChange={(_, value) => setPage(value)}
                  color="primary"
                />
              </Stack>
            </>
          )}
        </CardContent>
      </Card>
    </AdminPageShell>
  );
};

export default AdminAudit;
