import React from 'react';
import { Link as RouterLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  Avatar,
  BottomNavigation,
  BottomNavigationAction,
  Box,
  Button,
  ButtonBase,
  IconButton,
  Stack,
  Tooltip,
  Typography,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import {
  Dashboard,
  DevicesOther,
  HealthAndSafety,
  History,
  Logout,
  People,
} from '@mui/icons-material';
import { useAuth } from '../contexts/AuthContext';
import SpectronLogo from './SpectronLogo';

const adminRoutes = [
  { label: 'Dashboard', mobileLabel: 'Home', path: '/admin', icon: <Dashboard /> },
  { label: 'Devices', mobileLabel: 'Devices', path: '/admin/devices', icon: <DevicesOther /> },
  { label: 'Users', mobileLabel: 'Users', path: '/admin/users', icon: <People /> },
  { label: 'System Health', mobileLabel: 'Health', path: '/admin/system', icon: <HealthAndSafety /> },
  { label: 'Audit', mobileLabel: 'Audit', path: '/admin/audit', icon: <History /> },
];

const getInitials = (name?: string) => {
  const source = (name || 'Admin').trim();
  const parts = source.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  }
  return source.slice(0, 2).toUpperCase();
};

const getActiveIndex = (path: string) => {
  const index = adminRoutes
    .slice()
    .reverse()
    .findIndex((route) => {
      if (route.path === '/admin') {
        return path === '/admin';
      }
      return path === route.path || path.startsWith(`${route.path}/`);
    });

  if (index < 0) {
    return 0;
  }

  return adminRoutes.length - 1 - index;
};

const AdminLayout: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout } = useAuth();
  const theme = useTheme();
  const isDesktop = useMediaQuery(theme.breakpoints.up('md'));
  const [value, setValue] = React.useState(0);
  const displayName = user?.name || user?.email || 'Admin';
  const userInitials = getInitials(displayName);

  React.useEffect(() => {
    setValue(getActiveIndex(location.pathname));
  }, [location.pathname]);

  const handleChange = (_event: React.SyntheticEvent, newValue: number) => {
    setValue(newValue);
    navigate(adminRoutes[newValue].path);
  };

  const handleLogout = async () => {
    await logout();
    navigate('/admin/signin', { replace: true });
  };

  return (
    <Box
      sx={{
        position: 'relative',
        isolation: 'isolate',
        display: 'flex',
        minHeight: '100dvh',
        overflow: 'visible',
        '&::before': {
          content: '""',
          position: 'fixed',
          inset: 0,
          zIndex: -1,
          pointerEvents: 'none',
          userSelect: 'none',
          WebkitUserSelect: 'none',
          background:
            'radial-gradient(circle at 5% 0%, rgba(235, 79, 18, 0.1), transparent 30rem), linear-gradient(135deg, #f7f2ea 0%, #fffdf8 52%, #eef4e5 100%)',
        },
      }}
    >
      {isDesktop && (
        <Box
          component="aside"
          sx={{
            width: 286,
            p: 2,
            position: 'fixed',
            inset: '0 auto 0 0',
          }}
        >
          <Box
            sx={{
              height: '100%',
              bgcolor: 'transparent',
              borderRight: '1px solid rgba(60, 57, 17, 0.12)',
              borderRadius: 0,
              p: 2,
              boxShadow: 'none',
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mb: 4 }}>
              <SpectronLogo size={42} />
              <Box>
                <Typography variant="h6" sx={{ lineHeight: 1 }}>
                  Spectron Admin
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  Device operations
                </Typography>
              </Box>
            </Stack>

            <Stack spacing={1}>
              {adminRoutes.map((item, index) => (
                <ButtonBase
                  key={item.path}
                  component={RouterLink}
                  to={item.path}
                  onClick={() => setValue(index)}
                  sx={{
                    justifyContent: 'flex-start',
                    gap: 1.5,
                    px: 1.5,
                    py: 1.25,
                    borderRadius: 999,
                    color: value === index ? '#fffdf8' : 'text.secondary',
                    bgcolor: value === index ? 'primary.dark' : 'transparent',
                    textDecoration: 'none',
                    '&:hover': {
                      bgcolor: value === index ? 'primary.dark' : 'rgba(108, 137, 48, 0.1)',
                      textDecoration: 'none',
                    },
                    '& .MuiSvgIcon-root': {
                      color: value === index ? 'secondary.light' : 'primary.main',
                    },
                    '& .MuiTypography-root': {
                      textDecoration: 'none',
                    },
                  }}
                >
                  {item.icon}
                  <Typography variant="body2" fontWeight={800}>
                    {item.label}
                  </Typography>
                </ButtonBase>
              ))}
            </Stack>

            <Box
              sx={{
                mt: 'auto',
                p: 1.5,
                borderRadius: 0,
                bgcolor: 'transparent',
                borderTop: '1px solid rgba(60, 57, 17, 0.1)',
              }}
            >
              <Typography variant="caption" color="text.secondary">
                Signed in as
              </Typography>
              <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 1, minWidth: 0 }}>
                <Avatar
                  sx={{
                    width: 34,
                    height: 34,
                    bgcolor: 'primary.main',
                    fontSize: 13,
                    fontWeight: 800,
                  }}
                >
                  {userInitials}
                </Avatar>
                <Box sx={{ minWidth: 0, flexGrow: 1 }}>
                  <Typography variant="body2" noWrap fontWeight={800}>
                    {displayName}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    System admin
                  </Typography>
                </Box>
              </Stack>
              <Button
                fullWidth
                variant="outlined"
                color="primary"
                startIcon={<Logout />}
                onClick={handleLogout}
                sx={{ mt: 2 }}
              >
                Logout
              </Button>
            </Box>
          </Box>
        </Box>
      )}

      <Box
        component="main"
        sx={{
          flexGrow: 1,
          minWidth: 0,
          width: '100%',
          ml: { md: '286px' },
          pb: { xs: 'calc(88px + env(safe-area-inset-bottom))', md: 4 },
          overflow: 'visible',
        }}
      >
        <Box
          component="header"
          sx={{
            px: { xs: 2, md: 3 },
            pt: { xs: 2, md: 3 },
            pb: { xs: 1, md: 0 },
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          {!isDesktop && (
            <>
              <Stack direction="row" spacing={1.2} alignItems="center" sx={{ minWidth: 0 }}>
                <SpectronLogo size={38} />
                <Box sx={{ minWidth: 0 }}>
                  <Typography variant="h6" noWrap>
                    Spectron Admin
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    Device operations
                  </Typography>
                </Box>
              </Stack>
              <Tooltip title="Logout">
                <IconButton aria-label="Logout" onClick={handleLogout} color="primary">
                  <Logout />
                </IconButton>
              </Tooltip>
            </>
          )}
        </Box>
        <Box sx={{ px: { xs: 2, md: 3 }, py: { xs: 1, md: 3 } }}>
          <Outlet />
        </Box>
      </Box>

      {!isDesktop && (
        <BottomNavigation
          value={value}
          onChange={handleChange}
          showLabels
          sx={{
            position: 'fixed',
            bottom: 0,
            left: 0,
            right: 0,
            height: 'calc(64px + env(safe-area-inset-bottom))',
            pb: 'env(safe-area-inset-bottom)',
            borderRadius: '18px 18px 0 0',
            border: '1px solid rgba(60, 57, 17, 0.12)',
            boxShadow: '0 -8px 24px rgba(60, 57, 17, 0.08)',
            bgcolor: 'rgba(255, 253, 248, 0.98)',
            overflow: 'hidden',
            zIndex: 20,
            '& .MuiBottomNavigationAction-root': {
              minWidth: 0,
              px: 0.25,
            },
            '& .MuiBottomNavigationAction-label': {
              fontSize: 9,
              whiteSpace: 'nowrap',
            },
          }}
        >
          {adminRoutes.map((item) => (
            <BottomNavigationAction key={item.path} label={item.mobileLabel} icon={item.icon} />
          ))}
        </BottomNavigation>
      )}
    </Box>
  );
};

export default AdminLayout;
