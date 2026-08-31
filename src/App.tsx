import { ThemeProvider } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Container from '@mui/material/Container';
import Stepper from '@mui/material/Stepper';
import Step from '@mui/material/Step';
import StepLabel from '@mui/material/StepLabel';
import Paper from '@mui/material/Paper';
import theme from './theme';
import { useTenureTrack } from './hooks/useTenureTrack';
import DetailsForm from './components/DetailsForm';
import TopicReview from './components/TopicReview';
import CohortBuild from './components/CohortBuild';
import ReportView from './components/ReportView';
import DownloadStep from './components/DownloadStep';
import Footer from './components/Footer';

const STEPS = ['Your details', 'Review topics', 'Build cohort', 'Your report', 'Download'];

function App() {
  const tt = useTenureTrack();

  const activeStep = (() => {
    switch (tt.step) {
      case 'details': return 0;
      case 'topics': return 1;
      case 'build': return 2;
      case 'report': return 3;
      case 'download': return 4;
    }
  })();

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Box sx={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', bgcolor: 'background.default' }}>
        <Paper elevation={0} sx={{ borderBottom: 1, borderColor: 'divider' }}>
          <Container maxWidth="lg">
            <Box sx={{ display: 'flex', alignItems: 'center', py: 2, gap: 1.5 }}>
              <Box
                sx={{
                  width: 36,
                  height: 36,
                  borderRadius: 1,
                  bgcolor: 'primary.main',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'white',
                  fontWeight: 700,
                  fontSize: '1.1rem',
                }}
              >
                T
              </Box>
              <Typography variant="h6" fontWeight={700} sx={{ letterSpacing: '-0.5px' }}>
                TenureTrack App
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ ml: 1 }}>
                Where does your record stand?
              </Typography>
              <Typography variant="caption" color="text.disabled" sx={{ ml: 2, display: { xs: 'none', sm: 'block' } }}>
                Original concept by Taylor Sparks · University of Utah
              </Typography>
            </Box>
          </Container>
        </Paper>

        <Container maxWidth="lg" sx={{ py: 4, flex: 1 }}>
          <Box sx={{ maxWidth: 800, mx: 'auto', mb: 4 }}>
            <Stepper activeStep={activeStep} alternativeLabel>
              {STEPS.map((label) => (
                <Step key={label}>
                  <StepLabel>{label}</StepLabel>
                </Step>
              ))}
            </Stepper>
          </Box>

          <Box sx={{ maxWidth: 900, mx: 'auto' }}>
            {tt.step === 'details' && (
              <DetailsForm
                onSubmit={tt.submitDetails}
                onLoadExample={tt.loadExample}
                error={tt.error}
              />
            )}

            {tt.step === 'topics' && (
              <TopicReview
                topics={tt.topics}
                selectedIds={tt.selectedTopicIds}
                onConfirm={tt.confirmTopics}
                onBack={() => tt.setStep('details')}
              />
            )}

            {tt.step === 'build' && (
              <CohortBuild
                progress={tt.progress}
                building={tt.building}
                error={tt.error}
                onRun={tt.runBuild}
                onBack={() => tt.setStep('topics')}
              />
            )}

            {tt.step === 'report' && tt.report && (
              <ReportView
                report={tt.report}
                onDownload={() => tt.setStep('download')}
                onReset={tt.reset}
              />
            )}

            {tt.step === 'download' && tt.report && (
              <DownloadStep
                report={tt.report}
                onBack={() => tt.setStep('report')}
                onReset={tt.reset}
              />
            )}
          </Box>
        </Container>

        <Footer />
      </Box>
    </ThemeProvider>
  );
}

export default App;
