import {
  Bar,
  CartesianGrid,
  Legend,
  BarChart as RechartsBarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"

const data = [
  { name: "Jan", value: 400 },
  { name: "Feb", value: 300 },
  { name: "Mar", value: 200 },
  { name: "Apr", value: 278 },
  { name: "May", value: 189 },
  { name: "Jun", value: 239 },
]

export const BareMinimumChart = () => {
  // The most basic chart possible
  return (
    <div style={{ width: "100%", height: "500px", padding: "20px" }}>
      <ResponsiveContainer width="100%" height="100%">
        <RechartsBarChart width="100%" height="100%" data={data}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="name" />
          <YAxis />
          <Tooltip />
          <Legend />
          <Bar dataKey="value" fill="#8884d8" minPointSize={0} />
        </RechartsBarChart>
      </ResponsiveContainer>
    </div>
  )
}
