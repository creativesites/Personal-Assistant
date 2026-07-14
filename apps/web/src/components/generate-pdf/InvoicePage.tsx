'use client'

import { FC, useState, useEffect } from 'react'
import { Invoice, ProductLine } from './data/types'
import { initialInvoice, initialProductLine } from './data/initialData'
import EditableInput from './EditableInput'
import EditableSelect from './EditableSelect'
import EditableTextarea from './EditableTextarea'
import EditableCalendarInput from './EditableCalendarInput'
import EditableFileImage from './EditableFileImage'
import countryList from './data/countryList'
import Document from './Document'
import Page from './Page'
import View from './View'
import Text from './Text'
import { Font } from '@react-pdf/renderer'
import Download from './DownloadPDF'
import { format } from 'date-fns/format'

Font.register({
  family: 'Nunito',
  fonts: [
    { src: 'https://fonts.gstatic.com/s/nunito/v12/XRXV3I6Li01BKofINeaE.ttf' },
    {
      src: 'https://fonts.gstatic.com/s/nunito/v12/XRXW3I6Li01BKofA6sKUYevN.ttf',
      fontWeight: 600,
    },
  ],
})

interface Props {
  data?: Invoice
  pdfMode?: boolean
  onChange?: (invoice: Invoice) => void
}

const InvoicePage: FC<Props> = ({ data, pdfMode, onChange }) => {
  const [invoice, setInvoice] = useState<Invoice>(data ? { ...data } : { ...initialInvoice })
  const [subTotal, setSubTotal] = useState<number>(0)
  const [saleTax, setSaleTax] = useState<number>(0)

  const dateFormat = 'MMM dd, yyyy'
  const invoiceDate = invoice.invoiceDate !== '' ? new Date(invoice.invoiceDate) : new Date()
  const invoiceDueDate =
    invoice.invoiceDueDate !== ''
      ? new Date(invoice.invoiceDueDate)
      : new Date(invoiceDate.valueOf())

  if (invoice.invoiceDueDate === '') {
    invoiceDueDate.setDate(invoiceDueDate.getDate() + 30)
  }

  const handleChange = (name: keyof Invoice, value: string | number) => {
    if (name !== 'productLines') {
      const newInvoice = { ...invoice }
      if (name === 'logoWidth' && typeof value === 'number') {
        newInvoice[name] = value
      } else if (name !== 'logoWidth' && typeof value === 'string') {
        newInvoice[name] = value
      }
      setInvoice(newInvoice)
    }
  }

  const handleProductLineChange = (index: number, name: keyof ProductLine, value: string) => {
    const productLines = invoice.productLines.map((productLine, i) => {
      if (i === index) {
        const newProductLine = { ...productLine }
        if (name === 'description') {
          newProductLine[name] = value
        } else {
          if (
            value[value.length - 1] === '.' ||
            (value[value.length - 1] === '0' && value.includes('.'))
          ) {
            newProductLine[name] = value
          } else {
            const n = parseFloat(value)
            newProductLine[name] = (n ? n : 0).toString()
          }
        }
        return newProductLine
      }
      return { ...productLine }
    })
    setInvoice({ ...invoice, productLines })
  }

  const handleRemove = (i: number) => {
    const productLines = invoice.productLines.filter((_, index) => index !== i)
    setInvoice({ ...invoice, productLines })
  }

  const handleAdd = () => {
    const productLines = [...invoice.productLines, { ...initialProductLine }]
    setInvoice({ ...invoice, productLines })
  }

  const calculateAmount = (quantity: string, rate: string) => {
    const quantityNumber = parseFloat(quantity)
    const rateNumber = parseFloat(rate)
    const amount = quantityNumber && rateNumber ? quantityNumber * rateNumber : 0
    return amount.toFixed(2)
  }

  useEffect(() => {
    let sub = 0
    invoice.productLines.forEach((productLine) => {
      const quantityNumber = parseFloat(productLine.quantity)
      const rateNumber = parseFloat(productLine.rate)
      const amount = quantityNumber && rateNumber ? quantityNumber * rateNumber : 0
      sub += amount
    })
    setSubTotal(sub)
  }, [invoice.productLines])

  useEffect(() => {
    const match = invoice.taxLabel.match(/(\d+)%/)
    const taxRate = match ? parseFloat(match[1]) : 0
    const tax = subTotal ? (subTotal * taxRate) / 100 : 0
    setSaleTax(tax)
  }, [subTotal, invoice.taxLabel])

  useEffect(() => {
    if (onChange) {
      onChange(invoice)
    }
  }, [onChange, invoice])

  // PDF Renderer requires strict layout classes; we wrap interactive/responsive elements 
  // with safe classes when rendering on the web client vs inside react-pdf-renderer context.
  return (
    <Document pdfMode={pdfMode}>
      <Page className={pdfMode ? "invoice-wrapper" : "max-w-4xl mx-auto p-4 md:p-8 bg-white shadow-md rounded-xl font-sans text-gray-800 pb-24 md:pb-8"} pdfMode={pdfMode}>
        
        {/* Floating action bar for small screens, standard bar for desktops */}
        {!pdfMode && (
          <div className="fixed bottom-0 left-0 right-0 md:relative md:bottom-auto bg-gray-50 border-t border-gray-200 md:border-none p-4 z-50 flex justify-between items-center shadow-lg md:shadow-none md:bg-transparent md:mb-6">
            <span className="text-sm font-semibold text-gray-500 md:hidden">Draft Invoice</span>
            <Download data={invoice} setData={(d) => setInvoice(d)} />
          </div>
        )}

        {/* Brand Header */}
        <View className={pdfMode ? "flex" : "flex flex-col md:flex-row justify-between gap-6 pb-6 border-b border-gray-100"} pdfMode={pdfMode}>
          <View className={pdfMode ? "w-50" : "flex-1 flex flex-col gap-2"} pdfMode={pdfMode}>
            <EditableFileImage
              className="logo rounded-lg border border-dashed border-gray-300 p-2 hover:bg-gray-50 transition-colors"
              placeholder="Your Logo"
              value={invoice.logo}
              width={invoice.logoWidth}
              pdfMode={pdfMode}
              onChangeImage={(value) => handleChange('logo', value)}
              onChangeWidth={(value) => handleChange('logoWidth', value)}
            />
            <EditableInput
              className="text-xl md:text-2xl font-bold tracking-tight text-gray-900 w-full focus:outline-none focus:ring-2 focus:ring-indigo-500 rounded px-1"
              placeholder="Your Company"
              value={invoice.companyName}
              onChange={(value) => handleChange('companyName', value)}
              pdfMode={pdfMode}
            />
            <div className="grid grid-cols-1 gap-1 text-sm text-gray-600">
              <EditableInput
                placeholder="Your Name"
                value={invoice.name}
                onChange={(value) => handleChange('name', value)}
                pdfMode={pdfMode}
              />
              <EditableInput
                placeholder="Company's Address"
                value={invoice.companyAddress}
                onChange={(value) => handleChange('companyAddress', value)}
                pdfMode={pdfMode}
              />
              <EditableInput
                placeholder="City, State Zip"
                value={invoice.companyAddress2}
                onChange={(value) => handleChange('companyAddress2', value)}
                pdfMode={pdfMode}
              />
              <EditableSelect
                options={countryList}
                value={invoice.companyCountry}
                onChange={(value) => handleChange('companyCountry', value)}
                pdfMode={pdfMode}
              />
            </div>
          </View>
          
          <View className={pdfMode ? "w-50" : "w-full md:w-auto text-left md:text-right flex flex-col justify-between"} pdfMode={pdfMode}>
            <EditableInput
              className="text-4xl md:text-5xl font-extrabold tracking-tight text-gray-900 md:text-right w-full"
              placeholder="Invoice"
              value={invoice.title}
              onChange={(value) => handleChange('title', value)}
              pdfMode={pdfMode}
            />
          </View>
        </View>

        {/* Billing & Metadata Details */}
        <View className={pdfMode ? "flex mt-40" : "flex flex-col md:flex-row gap-8 mt-8 pb-8 border-b border-gray-100"} pdfMode={pdfMode}>
          <View className={pdfMode ? "w-55" : "flex-1 flex flex-col gap-2"} pdfMode={pdfMode}>
            <EditableInput
              className="text-xs font-bold tracking-wider uppercase text-gray-400 mb-1"
              value={invoice.billTo}
              onChange={(value) => handleChange('billTo', value)}
              pdfMode={pdfMode}
            />
            <div className="grid grid-cols-1 gap-1 text-sm text-gray-700">
              <EditableInput
                placeholder="Your Client's Name"
                value={invoice.clientName}
                onChange={(value) => handleChange('clientName', value)}
                pdfMode={pdfMode}
              />
              <EditableInput
                placeholder="Client's Address"
                value={invoice.clientAddress}
                onChange={(value) => handleChange('clientAddress', value)}
                pdfMode={pdfMode}
              />
              <EditableInput
                placeholder="City, State Zip"
                value={invoice.clientAddress2}
                onChange={(value) => handleChange('clientAddress2', value)}
                pdfMode={pdfMode}
              />
              <EditableSelect
                options={countryList}
                value={invoice.clientCountry}
                onChange={(value) => handleChange('clientCountry', value)}
                pdfMode={pdfMode}
              />
            </div>
          </View>

          <View className={pdfMode ? "w-45" : "w-full md:w-80 flex flex-col gap-3"} pdfMode={pdfMode}>
            <div className="grid grid-cols-2 items-center gap-2 text-sm">
              <EditableInput
                className="font-semibold text-gray-500"
                value={invoice.invoiceTitleLabel}
                onChange={(value) => handleChange('invoiceTitleLabel', value)}
                pdfMode={pdfMode}
              />
              <EditableInput
                placeholder="INV-12"
                className="text-gray-900 font-medium"
                value={invoice.invoiceTitle}
                onChange={(value) => handleChange('invoiceTitle', value)}
                pdfMode={pdfMode}
              />
            </div>
            <div className="grid grid-cols-2 items-center gap-2 text-sm">
              <EditableInput
                className="font-semibold text-gray-500"
                value={invoice.invoiceDateLabel}
                onChange={(value) => handleChange('invoiceDateLabel', value)}
                pdfMode={pdfMode}
              />
              <EditableCalendarInput
                value={format(invoiceDate, dateFormat)}
                selected={invoiceDate}
                onChange={(date) =>
                  handleChange(
                    'invoiceDate',
                    date && !Array.isArray(date) ? format(date, dateFormat) : '',
                  )
                }
                pdfMode={pdfMode}
              />
            </div>
            <div className="grid grid-cols-2 items-center gap-2 text-sm">
              <EditableInput
                className="font-semibold text-gray-500"
                value={invoice.invoiceDueDateLabel}
                onChange={(value) => handleChange('invoiceDueDateLabel', value)}
                pdfMode={pdfMode}
              />
              <EditableCalendarInput
                value={format(invoiceDueDate, dateFormat)}
                selected={invoiceDueDate}
                onChange={(date) =>
                  handleChange(
                    'invoiceDueDate',
                    date ? (!Array.isArray(date) ? format(date, dateFormat) : '') : '',
                  )
                }
                pdfMode={pdfMode}
              />
            </div>
          </View>
        </View>

        {/* Web Table Headers (Hidden on Mobile) */}
        {!pdfMode && (
          <div className="hidden md:flex bg-gray-900 text-white rounded-t-lg mt-8 text-xs font-semibold uppercase tracking-wider">
            <div className="w-1/2 p-4">{invoice.productLineDescription}</div>
            <div className="w-1/6 p-4 text-right">{invoice.productLineQuantity}</div>
            <div className="w-1/6 p-4 text-right">{invoice.productLineQuantityRate}</div>
            <div className="w-1/6 p-4 text-right">{invoice.productLineQuantityAmount}</div>
          </div>
        )}

        {/* Fallback layout wrapper strictly for react-pdf compilation */}
        {pdfMode && (
          <View className="mt-30 bg-dark flex" pdfMode={pdfMode}>
            <View className="w-48 p-4-8"><Text className="white bold">{invoice.productLineDescription}</Text></View>
            <View className="w-17 p-4-8"><Text className="white bold right">{invoice.productLineQuantity}</Text></View>
            <View className="w-17 p-4-8"><Text className="white bold right">{invoice.productLineQuantityRate}</Text></View>
            <View className="w-18 p-4-8"><Text className="white bold right">{invoice.productLineQuantityAmount}</Text></View>
          </View>
        )}

        {/* Product Items List */}
        <div className="flex flex-col gap-4 md:gap-0">
          {invoice.productLines.map((productLine, i) => {
            return pdfMode && productLine.description === '' ? (
              <Text key={i}></Text>
            ) : (
              <View 
                key={i} 
                className={pdfMode ? "row flex" : "flex flex-col md:flex-row items-stretch border border-gray-200 md:border-none rounded-lg p-4 md:p-0 md:border-b md:border-gray-100 relative group bg-white md:bg-transparent"} 
                pdfMode={pdfMode}
              >
                {/* Mobile labels are dynamic layout components */}
                <View className={pdfMode ? "w-48 p-4-8 pb-10" : "w-full md:w-1/2 md:p-4"} pdfMode={pdfMode}>
                  {!pdfMode && <label className="md:hidden text-xs font-bold text-gray-400 mb-1 block uppercase">Description</label>}
                  <EditableTextarea
                    className="w-full border-none focus:ring-0 resize-none text-sm text-gray-900"
                    rows={2}
                    placeholder="Enter item name/description"
                    value={productLine.description}
                    onChange={(value) => handleProductLineChange(i, 'description', value)}
                    pdfMode={pdfMode}
                  />
                </View>

                <View className={pdfMode ? "w-17 p-4-8 pb-10" : "w-full md:w-1/6 md:p-4 flex md:block items-center justify-between border-t border-gray-100 md:border-none pt-2 mt-2 md:pt-0 md:mt-0"} pdfMode={pdfMode}>
                  {!pdfMode && <label className="md:hidden text-xs font-bold text-gray-400 uppercase">Quantity</label>}
                  <EditableInput
                    className="w-24 md:w-full text-right bg-transparent text-sm"
                    value={productLine.quantity}
                    onChange={(value) => handleProductLineChange(i, 'quantity', value)}
                    pdfMode={pdfMode}
                  />
                </View>

                <View className={pdfMode ? "w-17 p-4-8 pb-10" : "w-full md:w-1/6 md:p-4 flex md:block items-center justify-between"} pdfMode={pdfMode}>
                  {!pdfMode && <label className="md:hidden text-xs font-bold text-gray-400 uppercase">Rate</label>}
                  <EditableInput
                    className="w-24 md:w-full text-right bg-transparent text-sm"
                    value={productLine.rate}
                    onChange={(value) => handleProductLineChange(i, 'rate', value)}
                    pdfMode={pdfMode}
                  />
                </View>

                <View className={pdfMode ? "w-18 p-4-8 pb-10" : "w-full md:w-1/6 md:p-4 flex md:block items-center justify-between font-semibold text-gray-900"} pdfMode={pdfMode}>
                  {!pdfMode && <label className="md:hidden text-xs font-bold text-gray-400 uppercase">Amount</label>}
                  <Text className="text-right text-sm" pdfMode={pdfMode}>
                    {calculateAmount(productLine.quantity, productLine.rate)}
                  </Text>
                </View>

                {!pdfMode && (
                  <button
                    className="absolute -top-2 -right-2 md:top-auto md:right-4 md:self-center bg-red-100 hover:bg-red-200 text-red-600 rounded-full p-2 md:opacity-0 group-hover:opacity-100 transition-opacity duration-150 focus:opacity-100 shadow-md md:shadow-none"
                    aria-label="Remove Row"
                    title="Remove Row"
                    onClick={() => handleRemove(i)}
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                )}
              </View>
            )
          })}
        </div>

        {/* Invoice Footer Controls & Financials */}
        <View className={pdfMode ? "flex" : "flex flex-col md:flex-row gap-6 mt-6 items-start"} pdfMode={pdfMode}>
          <View className={pdfMode ? "w-50 mt-10" : "w-full md:w-1/2"} pdfMode={pdfMode}>
            {!pdfMode && (
              <button 
                onClick={handleAdd}
                className="w-full md:w-auto inline-flex items-center justify-center px-4 py-2 border.5 border-dashed border-gray-300 rounded-lg text-sm font-medium text-indigo-600 bg-indigo-50 hover:bg-indigo-100 transition-colors focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
                </svg>
                Add Line Item
              </button>
            )}
          </View>

          <View className={pdfMode ? "w-50 mt-20" : "w-full md:w-1/2 flex flex-col gap-2 bg-gray-50 rounded-xl p-4 ml-auto"} pdfMode={pdfMode}>
            <View className={pdfMode ? "flex" : "flex justify-between items-center py-1.5 text-sm"} pdfMode={pdfMode}>
              <View className={pdfMode ? "w-50 p-5" : "text-gray-500"} pdfMode={pdfMode}>
                <EditableInput
                  value={invoice.subTotalLabel}
                  onChange={(value) => handleChange('subTotalLabel', value)}
                  pdfMode={pdfMode}
                />
              </View>
              <View className={pdfMode ? "w-50 p-5" : "text-gray-900 font-semibold text-right"} pdfMode={pdfMode}>
                <Text pdfMode={pdfMode}>
                  {subTotal.toFixed(2)}
                </Text>
              </View>
            </View>

            <View className={pdfMode ? "flex" : "flex justify-between items-center py-1.5 text-sm"} pdfMode={pdfMode}>
              <View className={pdfMode ? "w-50 p-5" : "text-gray-500"} pdfMode={pdfMode}>
                <EditableInput
                  value={invoice.taxLabel}
                  onChange={(value) => handleChange('taxLabel', value)}
                  pdfMode={pdfMode}
                />
              </View>
              <View className={pdfMode ? "w-50 p-5" : "text-gray-900 font-semibold text-right"} pdfMode={pdfMode}>
                <Text pdfMode={pdfMode}>
                  {saleTax.toFixed(2)}
                </Text>
              </View>
            </View>

            <View className={pdfMode ? "flex bg-gray p-5" : "flex justify-between items-center bg-indigo-600 text-white rounded-lg p-3 mt-2 shadow-sm"} pdfMode={pdfMode}>
              <View className={pdfMode ? "w-50 p-5" : "font-bold text-white"} pdfMode={pdfMode}>
                <EditableInput
                  className="font-bold text-white bg-transparent w-full"
                  value={invoice.totalLabel}
                  onChange={(value) => handleChange('totalLabel', value)}
                  pdfMode={pdfMode}
                />
              </View>
              <View className={pdfMode ? "w-50 p-5 flex" : "flex items-center gap-1 font-bold text-right"} pdfMode={pdfMode}>
                <EditableInput
                  className="bg-transparent font-bold text-white text-right max-w-[50px] uppercase focus:outline-none"
                  value={invoice.currency}
                  onChange={(value) => handleChange('currency', value)}
                  pdfMode={pdfMode}
                />
                <Text pdfMode={pdfMode}>
                  {((typeof subTotal !== 'undefined' && typeof saleTax !== 'undefined'
                    ? subTotal + saleTax
                    : 0
                  ).toFixed(2))}
                </Text>
              </View>
            </View>
          </View>
        </View>

        {/* Additional Terms / Notes */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-8 border-t border-gray-100 pt-6">
          <View className={pdfMode ? "mt-20" : "flex flex-col gap-1.5"} pdfMode={pdfMode}>
            <EditableInput
              className="text-xs font-bold tracking-wider uppercase text-gray-400"
              value={invoice.notesLabel}
              onChange={(value) => handleChange('notesLabel', value)}
              pdfMode={pdfMode}
            />
            <EditableTextarea
              className="w-full border border-gray-200 rounded-lg p-3 text-sm text-gray-600 focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 bg-white"
              rows={2}
              value={invoice.notes}
              onChange={(value) => handleChange('notes', value)}
              pdfMode={pdfMode}
            />
          </View>
          <View className={pdfMode ? "mt-20" : "flex flex-col gap-1.5"} pdfMode={pdfMode}>
            <EditableInput
              className="text-xs font-bold tracking-wider uppercase text-gray-400"
              value={invoice.termLabel}
              onChange={(value) => handleChange('termLabel', value)}
              pdfMode={pdfMode}
            />
            <EditableTextarea
              className="w-full border border-gray-200 rounded-lg p-3 text-sm text-gray-600 focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 bg-white"
              rows={2}
              value={invoice.term}
              onChange={(value) => handleChange('term', value)}
              pdfMode={pdfMode}
            />
          </View>
        </div>
      </Page>
    </Document>
  )
}

export default InvoicePage