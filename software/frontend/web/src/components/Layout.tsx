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
  IconButton,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import {
  Agriculture,
  Sensors,
  ShowChart,
  Notifications,
  AccountCircle,
  Groups,
  Logout,
} from '@mui/icons-material';
import { useAuth } from '../contexts/AuthContext';
import SpectronLogo from './SpectronLogo';

type AppRoute = {
  label: string;
  mobileLabel: string;
  path: string;
  icon: React.ReactNode;
};

const baseRoutes: AppRoute[] = [
  { label: 'Farms', mobileLabel: 'Farms', path: '/farms', icon: <Agriculture /> },
  { label: 'Monitoring', mobileLabel: 'Live', path: '/monitoring', icon: <ShowChart /> },
  { label: 'Hardware', mobileLabel: 'Hardware', path: '/hardware', icon: <Sensors /> },
  { label: 'Alerts', mobileLabel: 'Alerts', path: '/alerts', icon: <Notifications /> },
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
      ...(accountRole === 'OWNER' ? [{ label: 'Team', mobileLabel: 'Team', path: '/team', icon: <Groups /> }] : []),
      { label: 'Profile', mobileLabel: 'Profile', path: '/profile', icon: <AccountCircle /> },
    ],
    [accountRole]
  );
  const mobileRoutes = React.useMemo(
    () => [
      ...baseRoutes,
      ...(accountRole === 'OWNER'
        ? [{ label: 'Manage access', mobileLabel: 'Access', path: '/team', icon: <Groups /> }]
        : []),
    ],
    [accountRole]
  );

  React.useEffect(() => {
    const path = location.pathname;
    const normalizedPath = path.startsWith('/controllers') ? '/hardware' : path;
    const currentIndex = mobileRoutes.findIndex((route) => normalizedPath.startsWith(route.path));
    setValue(currentIndex >= 0 ? currentIndex : 0);
  }, [location, mobileRoutes]);

  const handleChange = (_event: React.SyntheticEvent, newValue: number) => {
    setValue(newValue);
    navigate(mobileRoutes[newValue].path);
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
            p: 1.75,
            position: 'fixed',
            inset: '0 auto 0 0',
          }}
        >
          <Box
            sx={{
              height: '100%',
              bgcolor: 'rgba(255, 253, 248, 0.76)',
              border: '1px solid rgba(60, 57, 17, 0.1)',
              borderRadius: 4,
              p: 2,
              boxShadow: '0 18px 44px rgba(60, 57, 17, 0.08)',
              backdropFilter: 'blur(16px)',
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            <Stack direction="row" spacing={1.25} alignItems="center" sx={{ mb: 3, px: 0.5 }}>
              <SpectronLogo size={38} />
              <Box>
                <Typography variant="h6" sx={{ lineHeight: 1 }}>
                  SPECTRON
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  AgriAssist
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
                    borderRadius: 2.5,
                    color: value === index ? '#fffdf8' : 'text.secondary',
                    bgcolor: value === index ? 'primary.dark' : 'transparent',
                    boxShadow: value === index ? '0 10px 22px rgba(60, 57, 17, 0.18)' : 'none',
                    transition: 'background-color 160ms ease, box-shadow 160ms ease, transform 160ms ease',
                    textDecoration: 'none',
                    '&:hover': {
                      bgcolor: value === index ? 'primary.dark' : 'rgba(108, 137, 48, 0.1)',
                      textDecoration: 'none',
                      transform: 'translateX(2px)',
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
                borderRadius: 3,
                bgcolor: 'rgba(255, 253, 248, 0.72)',
                border: '1px solid rgba(60, 57, 17, 0.1)',
                display: 'block',
                textAlign: 'left',
                color: 'inherit',
                textDecoration: 'none',
                boxShadow: '0 10px 24px rgba(60, 57, 17, 0.05)',
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
                sx={{ mt: 2, bgcolor: 'rgba(255, 253, 248, 0.76)' }}
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
            px: { xs: 2.5, md: 4 },
            pt: { xs: 2, md: 3 },
            pb: { xs: 1.25, md: 0 },
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          {!isDesktop && (
            <>
              <Stack direction="row" spacing={1.1} alignItems="center" sx={{ minWidth: 0 }}>
                <SpectronLogo size={32} />
                <Box sx={{ minWidth: 0 }}>
                  <Typography variant="subtitle2" fontWeight={900} letterSpacing={0.4} noWrap>
                    SPECTRON
                  </Typography>
                  <Typography variant="caption" color="text.secondary" noWrap>
                    AgriAssist
                  </Typography>
                </Box>
              </Stack>
              <IconButton
                aria-label="Open profile"
                onClick={() => navigate('/profile')}
                color="primary"
                sx={{ width: 44, height: 44, p: 0.25 }}
              >
                <Avatar
                  src={user?.avatar_url || undefined}
                  sx={{ width: 38, height: 38, bgcolor: 'primary.main', fontSize: 13, fontWeight: 800 }}
                >
                  {userInitials}
                </Avatar>
              </IconButton>
            </>
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
            '& .MuiSvgIcon-root': {
              fontSize: 22,
            },
          }}
        >
          {mobileRoutes.map((item) => (
            <BottomNavigationAction key={item.path} label={item.mobileLabel} icon={item.icon} />
          ))}
        </BottomNavigation>
      )}
    </Box>
  );
};

export default Layout;
