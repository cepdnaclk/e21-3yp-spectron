import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Container,
  Card,
  CardContent,
  Typography,
  Button,
  Box,
  Avatar,
  Stack,
  Grid,
  TextField,
  Alert,
  IconButton,
  InputAdornment,
  Collapse,
  Divider,
  Chip,
  Tooltip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
} from '@mui/material';
import {
  Logout,
  PhotoCamera,
  Save,
  LockReset,
  Visibility,
  VisibilityOff,
  ContentCopy,
  DeleteOutline,
} from '@mui/icons-material';
import { useAuth } from '../../contexts/AuthContext';
import { changePassword, deleteAccount, updateProfile } from '../../services/authService';
import { PageHeaderPanel, PageShell } from '../../components/ui/PageSurface';

const getApiMessage = (error: any, fallback: string) => {
  const responseData = error?.response?.data;
  return typeof responseData === 'string' ? responseData : responseData?.message || fallback;
};

const splitName = (name?: string) => {
  const trimmed = (name || '').trim();
  if (!trimmed) {
    return { firstName: '', lastName: '' };
  }

  const parts = trimmed.split(/\s+/);
  return {
    firstName: parts[0] || '',
    lastName: parts.slice(1).join(' '),
  };
};

const joinName = (firstName: string, lastName: string) => {
  return [firstName.trim(), lastName.trim()].filter(Boolean).join(' ');
};

const getInitials = (name?: string) => {
  const source = (name || 'Spectron User').trim();
  const parts = source.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  }
  return source.slice(0, 2).toUpperCase();
};

const isStrongEnough = (password: string) => {
  return password.length >= 8 && /[A-Za-z]/.test(password) && /\d/.test(password);
};

const Profile: React.FC = () => {
  const { user, logout, refreshUser } = useAuth();
  const navigate = useNavigate();
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [profileSaving, setProfileSaving] = useState(false);
  const [avatarSaving, setAvatarSaving] = useState(false);
  const [profileMessage, setProfileMessage] = useState('');
  const [profileError, setProfileError] = useState('');
  const [linkCopied, setLinkCopied] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteConfirmEmail, setDeleteConfirmEmail] = useState('');
  const [deleteSaving, setDeleteSaving] = useState(false);
  const [deleteError, setDeleteError] = useState('');

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [passwordMessage, setPasswordMessage] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [showPasswordForm, setShowPasswordForm] = useState(false);
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  useEffect(() => {
    const nextName = splitName(user?.name);
    setFirstName(nextName.firstName);
    setLastName(nextName.lastName);
    setPhone(user?.phone || '');
    setAvatarUrl(user?.avatar_url || '');
  }, [user]);

  useEffect(() => {
    if (!profileMessage && !profileError && !passwordMessage && !passwordError) {
      return;
    }

    const timer = window.setTimeout(() => {
      setProfileMessage('');
      setProfileError('');
      setPasswordMessage('');
      setPasswordError('');
    }, 5000);

    return () => {
      window.clearTimeout(timer);
    };
  }, [profileMessage, profileError, passwordMessage, passwordError]);

  useEffect(() => {
    if (!deleteError) {
      return undefined;
    }

    const timer = window.setTimeout(() => {
      setDeleteError('');
    }, 5000);

    return () => window.clearTimeout(timer);
  }, [deleteError]);

  const fullName = joinName(firstName, lastName);
  const profileDisplayName = fullName || user?.email || 'Spectron User';
  const initials = useMemo(() => getInitials(profileDisplayName), [profileDisplayName]);
  const accountRole = user?.accounts?.[0]?.role || 'Free';
  const accountLabel = accountRole === 'OWNER' ? 'Farm Owner' : accountRole === 'VIEWER' ? 'Viewer' : accountRole;
  const email = user?.email || '';
  const username = email ? `@${email.split('@')[0]}` : `@${profileDisplayName.replace(/\s+/g, '')}`;
  const canConfirmDeletion = Boolean(email) && deleteConfirmEmail.trim().toLowerCase() === email.toLowerCase();
  const profileUrl = useMemo(() => {
    if (typeof window === 'undefined') {
      return '';
    }
    return `${window.location.origin}/profile`;
  }, []);

  const handleLogout = async () => {
    await logout();
    navigate('/signin');
  };

  const saveAvatar = async (nextAvatarUrl: string) => {
    setAvatarSaving(true);
    setProfileMessage('');
    setProfileError('');

    try {
      await updateProfile({
        name: fullName,
        phone: phone.trim(),
        avatar_url: nextAvatarUrl,
      });
      await refreshUser();
      setProfileMessage(nextAvatarUrl ? 'Profile picture updated successfully.' : 'Profile picture removed.');
    } catch (error: any) {
      setProfileError(getApiMessage(error, 'Failed to update profile picture.'));
    } finally {
      setAvatarSaving(false);
    }
  };

  const handleAvatarUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setProfileMessage('');
    setProfileError('');

    if (!file.type.startsWith('image/')) {
      setProfileError('Please upload an image file.');
      return;
    }

    if (file.size > 1024 * 1024) {
      setProfileError('Avatar image must be under 1 MB.');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const nextAvatarUrl = typeof reader.result === 'string' ? reader.result : '';
      setAvatarUrl(nextAvatarUrl);
      if (nextAvatarUrl) {
        saveAvatar(nextAvatarUrl);
      }
    };
    reader.onerror = () => {
      setProfileError('Could not read the selected image.');
    };
    reader.readAsDataURL(file);
    event.target.value = '';
  };

  const handleRemoveAvatar = () => {
    setAvatarUrl('');
    saveAvatar('');
  };

  const handleCopyProfileLink = async () => {
    if (!profileUrl) {
      return;
    }

    try {
      await navigator.clipboard.writeText(profileUrl);
      setLinkCopied(true);
      setProfileMessage('Profile link copied.');
      window.setTimeout(() => setLinkCopied(false), 1800);
    } catch (error) {
      setProfileError('Could not copy profile link.');
    }
  };

  const handleSaveProfile = async () => {
    setProfileMessage('');
    setProfileError('');

    if (!firstName.trim()) {
      setProfileError('Enter your first name.');
      return;
    }

    setProfileSaving(true);

    try {
      await updateProfile({
        name: fullName,
        phone: phone.trim(),
        avatar_url: avatarUrl,
      });
      await refreshUser();
      setProfileMessage('Profile details updated successfully.');
    } catch (error: any) {
      setProfileError(getApiMessage(error, 'Failed to update profile.'));
    } finally {
      setProfileSaving(false);
    }
  };

  const handleChangePassword = async () => {
    setPasswordMessage('');
    setPasswordError('');

    if (!currentPassword) {
      setPasswordError('Enter your current password.');
      return;
    }

    if (!isStrongEnough(newPassword)) {
      setPasswordError('New password must be at least 8 characters and include a letter and a number.');
      return;
    }

    if (newPassword !== confirmPassword) {
      setPasswordError('New password and confirmation do not match.');
      return;
    }

    setPasswordSaving(true);
    try {
      await changePassword({
        current_password: currentPassword,
        new_password: newPassword,
      });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setShowPasswordForm(false);
      setPasswordMessage('Password updated successfully.');
    } catch (error: any) {
      setPasswordError(getApiMessage(error, 'Failed to update password.'));
    } finally {
      setPasswordSaving(false);
    }
  };

  const openDeleteDialog = () => {
    setDeleteConfirmEmail('');
    setDeleteError('');
    setDeleteDialogOpen(true);
  };

  const closeDeleteDialog = () => {
    if (deleteSaving) {
      return;
    }

    setDeleteDialogOpen(false);
    setDeleteConfirmEmail('');
    setDeleteError('');
  };

  const handleDeleteAccount = async () => {
    setDeleteError('');

    if (!canConfirmDeletion) {
      setDeleteError('Type your email address to confirm account deletion.');
      return;
    }

    setDeleteSaving(true);
    try {
      await deleteAccount({ confirm_email: deleteConfirmEmail.trim() });
      await logout();
      navigate('/signin');
    } catch (error: any) {
      setDeleteError(getApiMessage(error, 'Failed to delete account.'));
    } finally {
      setDeleteSaving(false);
    }
  };

  const passwordAdornment = (
    visible: boolean,
    setVisible: React.Dispatch<React.SetStateAction<boolean>>,
    showLabel: string,
    hideLabel: string
  ) => (
    <InputAdornment position="end">
      <IconButton
        aria-label={visible ? hideLabel : showLabel}
        onClick={() => setVisible((current) => !current)}
        onMouseDown={(event) => event.preventDefault()}
        edge="end"
      >
        {visible ? <Visibility /> : <VisibilityOff />}
      </IconButton>
    </InputAdornment>
  );

  return (
    <Container maxWidth="lg" sx={{ py: { xs: 2, md: 3 } }}>
      <PageShell>
      <PageHeaderPanel
        title={profileDisplayName}
        subtitle={`${accountLabel} account`}
        icon={<Avatar src={avatarUrl || undefined} sx={{ width: 28, height: 28, bgcolor: 'primary.dark' }}>{initials}</Avatar>}
        info="Manage your profile details, password, and account access."
      />
      <Stack spacing={2.5}>
        <Card>
          <CardContent sx={{ p: { xs: 2.5, md: 3.5 } }}>
            <Stack
              direction={{ xs: 'column', md: 'row' }}
              spacing={{ xs: 2.5, md: 3.5 }}
              alignItems={{ xs: 'flex-start', md: 'center' }}
              justifyContent="space-between"
            >
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2.5} alignItems={{ xs: 'center', sm: 'center' }}>
                <Box sx={{ position: 'relative' }}>
                  <Avatar
                    src={avatarUrl || undefined}
                    sx={{
                      width: { xs: 112, md: 136 },
                      height: { xs: 112, md: 136 },
                      bgcolor: 'primary.dark',
                      fontSize: { xs: 34, md: 42 },
                      fontWeight: 800,
                      border: '6px solid #faf0ea',
                      boxShadow: 'none',
                    }}
                  >
                    {initials}
                  </Avatar>
                  <Stack
                    direction="row"
                    spacing={0.5}
                    sx={{
                      position: 'absolute',
                      right: 4,
                      bottom: 4,
                      bgcolor: 'background.paper',
                      border: '1px solid rgba(60, 57, 17, 0.12)',
                      borderRadius: 999,
                      p: 0.25,
                    }}
                  >
                    {avatarUrl && (
                      <Tooltip title="Remove picture">
                        <span>
                          <IconButton
                            aria-label="Remove profile picture"
                            size="small"
                            color="error"
                            onClick={handleRemoveAvatar}
                            disabled={avatarSaving || profileSaving}
                          >
                            <DeleteOutline fontSize="small" />
                          </IconButton>
                        </span>
                      </Tooltip>
                    )}
                    <Tooltip title="Upload picture">
                      <IconButton
                        aria-label="Upload profile picture"
                        size="small"
                        component="label"
                        disabled={avatarSaving || profileSaving}
                      >
                        <PhotoCamera fontSize="small" />
                        <input hidden accept="image/*" type="file" onChange={handleAvatarUpload} />
                      </IconButton>
                    </Tooltip>
                  </Stack>
                </Box>

                <Box sx={{ textAlign: { xs: 'center', sm: 'left' } }}>
                  <Stack
                    direction={{ xs: 'column', sm: 'row' }}
                    spacing={1.25}
                    alignItems={{ xs: 'center', sm: 'center' }}
                  >
                    <Typography variant="h4">{profileDisplayName}</Typography>
                      <Chip label={accountLabel} color="primary" variant="outlined" size="small" />
                  </Stack>
                  <Typography variant="subtitle1" sx={{ mt: 1 }}>
                    {username}
                  </Typography>
                  <Stack
                    direction={{ xs: 'column', sm: 'row' }}
                    spacing={1}
                    alignItems={{ xs: 'center', sm: 'center' }}
                    sx={{ mt: 1, display: { xs: 'none', sm: 'flex' } }}
                  >
                    <Typography
                      variant="body2"
                      color="text.secondary"
                      sx={{ fontStyle: 'italic', wordBreak: 'break-all' }}
                    >
                      {profileUrl}
                    </Typography>
                    <Button
                      variant="outlined"
                      size="small"
                      startIcon={<ContentCopy />}
                      onClick={handleCopyProfileLink}
                    >
                      {linkCopied ? 'Copied' : 'Copy link'}
                    </Button>
                  </Stack>
                </Box>
              </Stack>

              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} sx={{ width: { xs: '100%', md: 'auto' } }}>
                <Button
                  variant="outlined"
                  startIcon={<Logout />}
                  onClick={handleLogout}
                  sx={{ minWidth: { xs: 0, sm: 132 }, width: { xs: '100%', sm: 'auto' } }}
                >
                  Logout
                </Button>
                <Button
                  variant="contained"
                  color="primary"
                  startIcon={<Save />}
                  onClick={handleSaveProfile}
                  disabled={profileSaving || avatarSaving}
                  sx={{ minWidth: { xs: 0, sm: 154 }, width: { xs: '100%', sm: 'auto' } }}
                >
                  {profileSaving ? 'Saving...' : 'Save changes'}
                </Button>
              </Stack>
            </Stack>
          </CardContent>
        </Card>

        <Card>
          <CardContent sx={{ p: { xs: 2.5, md: 3.5 } }}>
            <Typography variant="h5">Account information</Typography>
            <Divider sx={{ my: 2.5 }} />

            <Collapse in={Boolean(profileMessage || profileError)} timeout={300} unmountOnExit>
              <Alert severity={profileError ? 'error' : 'success'} sx={{ mb: 2.5 }}>
                {profileError || profileMessage}
              </Alert>
            </Collapse>

            <Grid container spacing={2.5}>
              <Grid item xs={12} md={6}>
                <TextField
                  fullWidth
                  required
                  label="First Name"
                  placeholder="eg: Varshan"
                  value={firstName}
                  onChange={(event) => setFirstName(event.target.value)}
                  disabled={profileSaving}
                  helperText="The name entered here appears across your Spectron workspace."
                />
              </Grid>
              <Grid item xs={12} md={6}>
                <TextField
                  fullWidth
                  label="Last Name"
                  placeholder="eg: Kumar"
                  value={lastName}
                  onChange={(event) => setLastName(event.target.value)}
                  disabled={profileSaving}
                />
              </Grid>
              <Grid item xs={12}>
                <TextField fullWidth label="Email" value={email} disabled />
              </Grid>
              <Grid item xs={12}>
                <Alert severity="info">Email belongs to your Spectron account.</Alert>
              </Grid>
              <Grid item xs={12}>
                <TextField
                  fullWidth
                  label="Phone"
                  placeholder="eg: +94 77 123 4567"
                  value={phone}
                  onChange={(event) => setPhone(event.target.value)}
                  disabled={profileSaving}
                />
              </Grid>
            </Grid>
          </CardContent>
        </Card>

        <Card>
          <CardContent sx={{ p: { xs: 2.5, md: 3.5 } }}>
            <Typography variant="h5">Password</Typography>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} sx={{ mt: 2 }}>
              <Button
                variant="outlined"
                startIcon={<LockReset />}
                onClick={() => setShowPasswordForm((current) => !current)}
              >
                Reset password
              </Button>
            </Stack>

            <Collapse in={Boolean(passwordMessage || passwordError)} timeout={300} unmountOnExit>
              <Alert severity={passwordError ? 'error' : 'success'} sx={{ mt: 2.5 }}>
                {passwordError || passwordMessage}
              </Alert>
            </Collapse>

            <Collapse in={showPasswordForm} timeout={300} unmountOnExit>
              <Stack spacing={2} sx={{ mt: 2.5 }}>
                <Typography color="text.secondary">
                  Use at least 8 characters with a letter and a number.
                </Typography>
                <TextField
                  fullWidth
                  label="Current Password"
                  type={showCurrentPassword ? 'text' : 'password'}
                  placeholder="Enter current password"
                  value={currentPassword}
                  onChange={(event) => setCurrentPassword(event.target.value)}
                  disabled={passwordSaving}
                  InputProps={{
                    endAdornment: passwordAdornment(
                      showCurrentPassword,
                      setShowCurrentPassword,
                      'Show current password',
                      'Hide current password'
                    ),
                  }}
                />
                <Grid container spacing={2}>
                  <Grid item xs={12} md={6}>
                    <TextField
                      fullWidth
                      label="New Password"
                      type={showNewPassword ? 'text' : 'password'}
                      placeholder="Enter new password"
                      value={newPassword}
                      onChange={(event) => setNewPassword(event.target.value)}
                      disabled={passwordSaving}
                      InputProps={{
                        endAdornment: passwordAdornment(
                          showNewPassword,
                          setShowNewPassword,
                          'Show new password',
                          'Hide new password'
                        ),
                      }}
                    />
                  </Grid>
                  <Grid item xs={12} md={6}>
                    <TextField
                      fullWidth
                      label="Confirm New Password"
                      type={showConfirmPassword ? 'text' : 'password'}
                      placeholder="Re-enter new password"
                      value={confirmPassword}
                      onChange={(event) => setConfirmPassword(event.target.value)}
                      disabled={passwordSaving}
                      InputProps={{
                        endAdornment: passwordAdornment(
                          showConfirmPassword,
                          setShowConfirmPassword,
                          'Show confirm password',
                          'Hide confirm password'
                        ),
                      }}
                    />
                  </Grid>
                </Grid>
                <Button
                  variant="contained"
                  startIcon={<LockReset />}
                  onClick={handleChangePassword}
                  disabled={passwordSaving}
                  sx={{ alignSelf: { xs: 'stretch', sm: 'flex-start' } }}
                >
                  {passwordSaving ? 'Updating...' : 'Update Password'}
                </Button>
              </Stack>
            </Collapse>
          </CardContent>
        </Card>

        <Card>
          <CardContent sx={{ p: { xs: 2.5, md: 3.5 } }}>
            <Typography variant="h5" color="error.main">
              Delete Account
            </Typography>
            <Typography color="text.secondary" sx={{ mt: 0.75, mb: 2 }}>
              Permanently delete your account and farm workspace data.
            </Typography>
            <Button
              variant="outlined"
              color="error"
              startIcon={<DeleteOutline />}
              onClick={openDeleteDialog}
              disabled={deleteSaving}
            >
              Delete My Account
            </Button>
          </CardContent>
        </Card>
      </Stack>
      </PageShell>

      <Dialog open={deleteDialogOpen} onClose={closeDeleteDialog} fullWidth maxWidth="sm">
        <DialogTitle>Delete Account</DialogTitle>
        <DialogContent>
          <Typography color="text.secondary" sx={{ mb: 2 }}>
            This action permanently removes your account and workspace data. Type your email address to confirm.
          </Typography>
          <Alert severity="warning" sx={{ mb: 2 }}>
            This cannot be undone.
          </Alert>
          <TextField
            fullWidth
            label="Confirm Email"
            placeholder={`eg: ${email}`}
            value={deleteConfirmEmail}
            onChange={(event) => {
              setDeleteConfirmEmail(event.target.value);
              setDeleteError('');
            }}
            disabled={deleteSaving}
          />
          <Collapse in={Boolean(deleteError)} timeout={300} unmountOnExit>
            <Alert severity="error" sx={{ mt: 2 }}>
              {deleteError}
            </Alert>
          </Collapse>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 3 }}>
          <Button variant="outlined" onClick={closeDeleteDialog} disabled={deleteSaving}>
            Cancel
          </Button>
          <Button
            variant="contained"
            color="error"
            startIcon={<DeleteOutline />}
            onClick={handleDeleteAccount}
            disabled={deleteSaving || !canConfirmDeletion}
          >
            {deleteSaving ? 'Deleting...' : 'Delete My Account'}
          </Button>
        </DialogActions>
      </Dialog>
    </Container>
  );
};

export default Profile;
