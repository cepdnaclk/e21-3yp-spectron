import React from 'react';
import { Box } from '@mui/material';

interface SpectronLogoProps {
  alt?: string;
  size?: number;
}

const SpectronLogo: React.FC<SpectronLogoProps> = ({ alt = 'Spectron', size = 40 }) => (
  <Box
    component="img"
    src="/assets/spectron-logo.svg"
    alt={alt}
    sx={{
      display: 'block',
      flex: '0 0 auto',
      width: size,
      height: size,
      objectFit: 'contain',
    }}
  />
);

export default SpectronLogo;
