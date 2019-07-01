'use strict'

import React, { Component } from 'react'
import { StyleSheet, Text, TextInput, View } from 'react-native'
import { connect } from 'react-redux'
import SafeAreaView from 'react-native-safe-area-view'
import { fbt } from 'fbt-runtime'
import get from 'lodash.get'
import RNPickerSelect from 'react-native-picker-select'
import * as RNLocalize from 'react-native-localize'

import { setPhoneAttestation } from 'actions/Onboarding'
import OriginButton from 'components/origin-button'
import PinInput from 'components/pin-input'
import withOnboardingSteps from 'hoc/withOnboardingSteps'
import withConfig from 'hoc/withConfig'
import OnboardingStyles from 'styles/onboarding'
import _countryCodes from 'utils/countryCodes'

const commonCountryCodes = [
  '1', // US/CA
  '7', // RU
  '44', // UK
  '61', // AU
  '81', // JP
  '82', // KR
  '86', // CN,
  '91' // IN
]

const [commonCountries, uncommonCountries] = _countryCodes
  // Generate the options
  .map(item => {
    return {
      label: `${item.name} (${item.prefix})`,
      value: item
    }
  })
  .sort((a, b) => (a.label > b.label ? 1 : -1))
  // Partition into common and uncommon countries to allow for a separator in
  // the select
  .reduce(
    (result, option) => {
      result[commonCountryCodes.includes(option.value.prefix) ? 0 : 1].push(
        option
      )
      return result
    },
    [[], []]
  )

const countryOptions = [
  ...commonCountries,
  { value: false, label: '---' }, // Separator
  ...uncommonCountries
]

class PhoneScreen extends Component {
  constructor(props) {
    super(props)

    let countryValue = ''

    const locales = RNLocalize.getLocales()
    if (locales) {
      const countryMatch = countryOptions.find(c => {
        if (c.value) {
          return (
            c.value.code.toLowerCase() === locales[0].countryCode.toLowerCase()
          )
        }
      })
      if (countryMatch) {
        countryValue = countryMatch.value
      }
    }

    this.state = {
      countryValue: countryValue,
      phoneValue: '',
      phoneError: '',
      loading: false,
      verify: false,
      verifyError: '',
      verificationCode: '',
      verificationMethod: 'sms'
    }
  }

  componentDidMount() {
    // Override the back button functionality in header
    this.props.navigation.setParams({
      handleBack: this.handleBack.bind(this)
    })
  }

  handleChange = async (field, value) => {
    await this.setState({ [`${field}Error`]: '', [`${field}Value`]: value })
  }

  /* Override the back function because of the verify step being present on this
   * screen and not on a separate route.
   */
  handleBack = () => {
    this.state.verify
      ? this.setState({ verify: false })
      : this.props.navigation.goBack(null)
  }

  /* Handle submission of phone number. Check if an identity with this phone
   * number exists, and if so redirect to a warning. Otherwise generate a
   * verification code and SMS it to the user.
   */
  handleSubmitPhone = async () => {
    this.setState({ loading: true })

    if (!this.props.onboarding.noRewardsDismissed) {
      const exists = await this.checkDuplicateIdentity()
      if (exists) {
        this.setState({ loading: false })
        this.props.navigation.navigate('ImportWarning', {
          // Call this function again on return from import warning, except
          // the noRewardsDismissed predicate will be true now
          onGoBack: () => this.handleSubmitPhone(true)
        })
        return
      }
    }

    const response = await this.generateVerificationCode()
    if (response.ok) {
      this.setState({ loading: false, verify: true })
    } else {
      this.setState({
        loading: false,
        phoneError: get(response.json(), 'errors[0]', '')
      })
    }
  }

  /* Send a request to @origin/bridge looking for a duplicate for this phone.
   */
  checkDuplicateIdentity = async () => {
    const url = `${this.props.config.bridge}/utils/exists`
    const response = await fetch(url, {
      headers: { 'content-type': 'application/json' },
      method: 'POST',
      body: JSON.stringify({
        phone: `${this.state.countryValue.prefix} ${this.state.phoneValue}`
      })
    })
    // 200 status code indicates account was found
    return response.status === 200
  }

  /* Request a verification code from @origin/bridge.
   */
  generateVerificationCode = async () => {
    const url = `${this.props.config.bridge}/api/attestations/phone/generate-code`
    return await fetch(url, {
      headers: { 'content-type': 'application/json' },
      credentials: 'include',
      method: 'POST',
      body: JSON.stringify({
        country_calling_code: this.state.countryValue.prefix,
        method: this.state.verificationMethod,
        phone: this.state.phoneValue
      })
    })
  }

  /* Handle submission of the verification code. Send it to @origin/bridge and
   * store the resulting attestation, or display an error.
   */
  handleSubmitVerification = async () => {
    this.setState({ loading: true })
    const url = `${this.props.config.bridge}/api/attestations/phone/verify`
    const response = await fetch(url, {
      headers: { 'content-type': 'application/json' },
      credentials: 'include',
      method: 'POST',
      body: JSON.stringify({
        code: this.state.verificationCode,
        identity: this.props.wallet.activeAccount.address,
        country_calling_code: this.state.countryValue.prefix,
        phone: this.state.phoneValue
      })
    })

    const data = await response.json()
    this.setState({ loading: false })
    if (!response.ok) {
      this.setState({ verifyError: get(data, 'errors[0]', '') })
    } else {
      this.props.setPhoneAttestation(data)
      this.props.navigation.navigate(this.props.nextOnboardingStep)
    }
  }

  handleSkip = async () => {
    await this.props.setPhoneAttestation(false)
    this.props.navigation.navigate(this.props.nextOnboardingStep)
  }

  render() {
    return (
      <SafeAreaView style={styles.container}>
        {!this.state.verify ? this.renderInput() : this.renderVerify()}
      </SafeAreaView>
    )
  }

  /* Render the phone input.
   */
  renderInput() {
    return (
      <>
        <View style={styles.content}>
          <Text style={styles.title}>
            <fbt desc="PhoneScreen.inputTitle">Enter phone number</fbt>
          </Text>
          <Text style={styles.subtitle}>
            <fbt desc="PhoneScreen.inputSubtitle">
              Enter a valid phone number
            </fbt>
          </Text>
          <RNPickerSelect
            placeholder={{ label: 'Select a country', value: null }}
            items={countryOptions}
            onValueChange={async value => {
              await this.handleChange('country', value)
            }}
            style={pickerSelectStyles}
            value={this.state.countryValue}
          />
          <TextInput
            autoCapitalize="none"
            autoCorrect={false}
            autoFocus={false}
            multiline={false}
            returnKeyType="next"
            onChangeText={value => this.handleChange('phone', value)}
            onSubmitEditing={this.handleSubmitPhone}
            value={this.state.phoneValue}
            style={[styles.input, this.state.phoneError ? styles.invalid : {}]}
          />
          {this.state.phoneError.length > 0 && (
            <Text style={styles.invalid}>{this.state.phoneError}</Text>
          )}
          <View style={styles.legalContainer}>
            <Text style={styles.legal}>
              <fbt desc="PhoneScreen.inputHelpText">
                By verifying your phone number, you give Origin permission to
                send you occasional messages such as notifications about your
                transactions.
              </fbt>
            </Text>
          </View>
        </View>
        {this.renderVisibilityWarning()}
        <View style={styles.buttonsContainer}>
          <OriginButton
            size="large"
            type="primary"
            style={styles.button}
            textStyle={{ fontSize: 18, fontWeight: '900' }}
            title={fbt('Continue', 'PhoneScreen.continueButton')}
            disabled={
              !this.state.phoneValue.length ||
              !this.state.countryValue ||
              this.state.phoneError ||
              this.state.loading
            }
            onPress={this.handleSubmitPhone}
            loading={this.state.loading}
          />
        </View>
      </>
    )
  }

  /* Render the input for the verification code.
   */
  renderVerify() {
    return (
      <>
        <View style={styles.content}>
          <Text style={styles.title}>
            <fbt desc="PhoneScreen.verifyTitle">Verify your phone</fbt>
          </Text>
          <Text style={styles.subtitle}>
            <fbt desc="PhoneScreen.verifySubtitle">Enter code</fbt>
          </Text>
          <PinInput
            value={this.state.verificationCode}
            pinLength={6}
            onChangeText={async value => {
              await this.setState({
                verificationCode: value.substr(0, 6),
                verifyError: ''
              })
              if (this.state.verificationCode.length === 6) {
                this.handleSubmitVerification()
              }
            }}
          />
          {this.state.verifyError.length > 0 && (
            <Text style={styles.invalid}>{this.state.verifyError}</Text>
          )}
          <View style={styles.legalContainer}>
            <Text style={styles.legal}>
              <fbt desc="PhoneScreen.verifyHelpText">
                We sent you a code to the phone address you provided. Please
                enter it above.
              </fbt>
            </Text>
          </View>
        </View>
        {this.renderVisibilityWarning()}
        <View style={styles.buttonsContainer}>
          <OriginButton
            size="large"
            type="link"
            style={styles.button}
            textStyle={{ fontSize: 18, fontWeight: '900' }}
            title={fbt('Skip', 'PhoneScreen.skipButton')}
            onPress={this.handleSkip}
          />
          <OriginButton
            size="large"
            type="primary"
            style={styles.button}
            textStyle={{ fontSize: 18, fontWeight: '900' }}
            title={fbt('Verify', 'PhoneScreen.verifyButton')}
            disabled={
              this.state.verificationCode.length < 6 ||
              this.state.verifyError ||
              this.state.loading
            }
            onPress={this.handleSubmitVerification}
            loading={this.state.loading}
          />
        </View>
      </>
    )
  }

  renderVisibilityWarning() {
    return (
      <View style={styles.visibilityWarningContainer}>
        <Text style={styles.visibilityWarningHeader}>
          What will be visible on the blockchain?
        </Text>
        <Text style={styles.visibilityWarningText}>
          That you have a verified phone, but NOT your actual phone number.
        </Text>
      </View>
    )
  }
}

const mapStateToProps = ({ onboarding, wallet }) => {
  return { onboarding, wallet }
}

const mapDispatchToProps = dispatch => ({
  setPhoneAttestation: phoneAttestation =>
    dispatch(setPhoneAttestation(phoneAttestation))
})

export default withConfig(
  withOnboardingSteps(
    connect(
      mapStateToProps,
      mapDispatchToProps
    )(PhoneScreen)
  )
)

const styles = StyleSheet.create({
  ...OnboardingStyles
})

const pickerSelectStyles = StyleSheet.create({
  viewContainer: {
    alignItems: 'center'
  },
  inputIOS: {
    color: 'black',
    fontSize: 20,
    borderColor: '#c0cbd4',
    borderBottomWidth: 1,
    paddingTop: 20,
    paddingBottom: 10,
    marginBottom: 20,
    paddingHorizontal: 20,
    width: 300,
    textAlign: 'center'
  },
  inputAndroid: {
    color: 'black',
    fontSize: 20,
    borderColor: '#c0cbd4',
    borderBottomWidth: 1,
    paddingTop: 20,
    paddingBottom: 10,
    marginBottom: 20,
    paddingHorizontal: 20,
    width: 300,
    textAlign: 'center'
  }
})