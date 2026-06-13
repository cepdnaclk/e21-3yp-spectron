import React from 'react';
import { Link as RouterLink, Outlet, useNavigate, useLocation } from 'react-router-dom';
import {
  Typography,
  BottomNavigation,
  BottomNavigationAction,
  Box,
  Avatar,
  Stack,
  Button,
  ButtonBase,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import {
  Hub as ChipIcon,
  Dashboard,
  Notifications,
  AccountCircle,
  Groups,
  Logout,
} from '@mui/icons-material';
import { useAuth } from '../contexts/AuthContext';
import SpectronLogo from './SpectronLogo';

const baseRoutes = [
  { label: 'Controllers', path: '/controllers', icon: <ChipIcon /> },
  { label: 'Monitoring', path: '/monitoring', icon: <Dashboard /> },
  { label: 'Alerts', path: '/alerts', icon: <Notifications /> },
];

const getInitials = (name?: string) => {
  const source = (name || 'Spectron User').trim();
  const parts = source.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  }
  return source.slice(0, 2).toUpperCase();
};

const Layout: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout } = useAuth();
  const theme = useTheme();
  const isDesktop = useMediaQuery(theme.breakpoints.up('md'));
  const [value, setValue] = React.useState(0);
  const displayName = user?.name || 'Spectron User';
  const userInitials = getInitials(user?.name);
  const accountRole = user?.accounts?.[0]?.role || 'VIEWER';
  const routes = React.useMemo(
    () => [
      ...baseRoutes,
      ...(accountRole === 'OWNER' ? [{ label: 'Team', path: '/team', icon: <Groups /> }] : []),
      { label: 'Profile', path: '/profile', icon: <AccountCircle /> },
    ],
    [accountRole]
  );

  React.useEffect(() => {
    const path = location.pathname;
    if (path.startsWith('/controllers')) setValue(0);
    else if (path.startsWith('/monitoring')) setValue(1);
    else if (path.startsWith('/alerts')) setValue(2);
    else {
      const currentIndex = routes.findIndex((route) => path.startsWith(route.path));
      setValue(currentIndex >= 0 ? currentIndex : 0);
    }
  }, [location, routes]);

  const handleChange = (_event: React.SyntheticEvent, newValue: number) => {
    setValue(newValue);
    navigate(routes[newValue].path);
  };

  const handleLogout = async () => {
    await logout();
    navigate('/signin', { replace: true });
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
            'radial-gradient(circle at 5% 0%, rgba(235, 79, 18, 0.12), transparent 30rem), linear-gradient(135deg, #faf0ea 0%, #fff8ed 48%, #edf4df 100%)',
        },
      }}
    >
      {isDesktop && (
        <Box
          component="aside"
          sx={{
            width: 268,
            p: 2,
            position: 'fixed',
            inset: '0 auto 0 0',
          }}
        >
          <Box
            sx={{
              height: '100%',
              bgcolor: 'transparent',
              borderRight: '1px solid rgba(60, 57, 17, 0.1)',
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
                  Spectron
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  Smart monitoring
                </Typography>
              </Box>
            </Stack>

            <Stack spacing={1}>
              {routes.map((item, index) => (
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
                display: 'block',
                textAlign: 'left',
                color: 'inherit',
                textDecoration: 'none',
              }}
            >
              <Typography variant="caption" color="text.secondary">
                Signed in as
              </Typography>
              <ButtonBase
                onClick={() => {
                  setValue(routes.findIndex((route) => route.path === '/profile'));
                  navigate('/profile');
                }}
                sx={{ display: 'flex', width: '100%', justifyContent: 'flex-start', mt: 1, borderRadius: 2 }}
              >
              <Stack direction="row" spacing={1} alignItems="center" sx={{ width: '100%' }}>
                <Avatar
                  src={user?.avatar_url || undefined}
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
                <Typography variant="body2" noWrap fontWeight={800}>
                  {displayName}
                </Typography>
              </Stack>
              </ButtonBase>
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
          ml: { md: '268px' },
          pb: { xs: 'calc(88px + env(safe-area-inset-bottom))', md: 4 },
          overflow: 'visible',
        }}
      >
        <Box
          component="header"
          sx={{
            px: { xs: 2, md: 4 },
            pt: { xs: 1.5, md: 3 },
            pb: { xs: 1, md: 0 },
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          {!isDesktop && (
            <Stack direction="row" spacing={1.2} alignItems="center">
              <SpectronLogo size={38} />
              <Typography variant="h6">Spectron</Typography>
            </Stack>
          )}
        </Box>
        <Outlet />
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
            overflow: 'hidden',
            zIndex: 20,
            bgcolor: 'rgba(255, 253, 248, 0.98)',
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
          {routes.map((item) => (
            <BottomNavigationAction key={item.path} label={item.label} icon={item.icon} />
          ))}
        </BottomNavigation>
      )}
    </Box>
  );
};

export default Layout;
